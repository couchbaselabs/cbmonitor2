// Panel creation utilities. Panels are authored as PromQL expressions and
// queried against the single Prometheus datasource (the gateway).

import { PanelBuilders, SceneDataTransformer, SceneFlexItem, SceneQueryRunner, SceneDataState } from '@grafana/scenes';
import { TooltipDisplayMode, LegendDisplayMode } from '@grafana/schema';
import { layoutService } from '../services/layoutService';
import { clusterFilterService } from '../services/clusterFilterService';
import { instanceFilterService } from '../services/instanceFilterService';
import { PROM_DATASOURCE_REF } from '../constants';
import { ROUTES, prefixRoute } from './utils.routing';

// Global counter for unique panel IDs
let panelIdCounter = 0;

/**
 * Check if data state has actual data values
 */
export function hasDataValues(dataState: SceneDataState | undefined): boolean {
    if (!dataState?.data) {
        return false;
    }
    
    const series = dataState.data.series;
    if (!series || series.length === 0) {
        return false;
    }
    
    // Check if any series has actual data points (not just empty fields)
    for (const s of series) {
        if (!s.fields || s.fields.length === 0) {
            continue;
        }
        // Look for value fields (skip time fields)
        for (const field of s.fields) {
            if (field.name !== 'Time' && field.name !== 'time' && field.values && field.values.length > 0) {
                // Check if values are not all null/undefined
                const hasValue = field.values.some((v: unknown) => v !== null && v !== undefined);
                if (hasValue) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

export function getNewTimeSeriesDataTransformer(queryRunner: SceneQueryRunner) {
    return new SceneDataTransformer({
        $data: queryRunner,
        transformations: [
            {
                id: 'prepareTimeSeries',
                options: {
                    format: 'multi',
                },
            },
        ],
    });
}

// Options for panel creation
type PanelOptions = {
    // PromQL expression — hardcoded, source of truth
    expr: string;
    // Prometheus legend format, e.g. '{{instance}}'. Default: '{{instance}}'
    legendFormat?: string;

    // SQL++ parameters for CBQueryBuilder (used when Couchbase datasource is active)
    snapshotId: string;
    labelFilters?: Record<string, string | string[]>;
    extraFields?: string[];
    transformFunction?: string; // e.g., 'rate', 'irate', 'increase' — uses AggregationQueryBuilder

    // Shared display options
    unit?: string;
    width?: string | number;
    height?: number;
};

// Build legend template for Grafana panel display name override
export function makeLegendTemplate(extraFields?: string[]): string {
    const ef = extraFields ?? [];
    const labelKeys = ef
        .map((f) => {
            const matchBackticks = f.match(/d\.labels\.\`([^`]+)\`/);
            if (matchBackticks) {
                return matchBackticks[1];
            }
            const matchDot = f.match(/d\.labels\.([^`\.]+)/);
            return matchDot ? matchDot[1] : undefined;
        })
        .filter((v): v is string => Boolean(v));

    if (labelKeys.length > 0) {
        const parts = labelKeys.map((k) => '${__field.labels.' + k + '}');
        return parts.join(' , ');
    }
    return '${__field.labels.instance}';
}

/**
 * Inject cluster filter into a PromQL expression.
 * Adds `cluster_uuid="<id>"` label selector to metric selectors that already have labels.
 *
 * @param expr - The PromQL expression
 * @param clusterId - The cluster ID to filter by
 * @returns The modified PromQL expression with cluster filter
 */
export function injectClusterFilter(expr: string, clusterId: string): string {
    // Only inject into metric selectors that already have a label block {....}
    // This avoids matching PromQL keywords like sum, by, rate, instance, etc.
    // Match: metric_name{labels...} and inject cluster_uuid before closing brace
    return expr.replace(/(\w+)\{([^}]*)\}/g, (_match, metric, labels) => {
        // Skip SGW metrics - they don't have cluster_uuid labels
        if (metric.startsWith('sgw_')) {
            return `${metric}{${labels}}`;
        }
        // Skip if cluster_uuid is already present
        if (labels.includes('cluster_uuid=')) {
            return `${metric}{${labels}}`;
        }
        // Inject cluster_uuid into the label set
        const separator = labels.trim() ? ', ' : '';
        return `${metric}{${labels}${separator}cluster_uuid="${clusterId}"}`;
    });
}

/**
 * Inject (or override) an `instance="<value>"` label selector on every metric
 * selector in the expression. Replaces an existing `instance="..."` rather
 * than skipping, so per-instance panels — whose dashboard builders hardcode a
 * specific instance into the expression — are correctly rescoped to the
 * drilldown's node. Mirrors {@link injectClusterFilter} otherwise.
 */
export function injectInstanceFilter(expr: string, instance: string): string {
    return expr.replace(/(\w+)\{([^}]*)\}/g, (_match, metric, labels) => {
        if (/\binstance\s*=/.test(labels)) {
            const replaced = labels.replace(/\binstance\s*=\s*"[^"]*"/, `instance="${instance}"`);
            return `${metric}{${replaced}}`;
        }
        const separator = labels.trim() ? ', ' : '';
        return `${metric}{${labels}${separator}instance="${instance}"}`;
    });
}

/**
 * Create a metric panel from a PromQL expression, queried against the single
 * Prometheus datasource. Active cluster/instance filters are injected into the
 * expression.
 *
 * @param metricName - Metric / refId identifier
 * @param title - Panel display title
 * @param options - Panel options (PromQL expr + display settings)
 */
export function createMetricPanel(
    metricName: string,
    title: string,
    options: PanelOptions
): SceneFlexItem {
    const panelWidth = options.width ?? layoutService.getPanelWidth();

    const panelBuilder = PanelBuilders.timeseries().setTitle(title);
    panelBuilder.setOption('tooltip', { mode: TooltipDisplayMode.Multi });
    panelBuilder.setOption('legend', {
        showLegend: true,
        placement: 'bottom',
        displayMode: LegendDisplayMode.List,
        sortBy: 'Name',
        sortDesc: false,
    });

    // Build legend template once — used as a display name override on both paths
    // so the legend style is consistent regardless of datasource.
    const legendTemplate = options.legendFormat
        ? options.legendFormat.replace(/\{\{(\w+)\}\}/g, '${__field.labels.$1}')
        : makeLegendTemplate(options.extraFields);
    // Data link to the node drilldown: rendered in the tooltip + legend
    // context menu whenever a series has an `instance` label. Grafana
    // resolves `${__field.labels.instance}` per-series, so non-instance
    // series (e.g. fully aggregated) leave the variable empty and the link
    // becomes harmless. snapshotId is baked in at build time.
    const nodeLinkUrlTemplate = options.snapshotId
        ? `${prefixRoute(ROUTES.CBMonitor)}/${encodeURIComponent(options.snapshotId)}/nodes/\${__field.labels.instance}`
        : undefined;
    panelBuilder.setOverrides((b) => {
        const m = b.matchFieldsByQuery(metricName).overrideDisplayName(legendTemplate);
        if (nodeLinkUrlTemplate) {
            m.overrideLinks([{
                title: 'Open node ${__field.labels.instance}',
                url: nodeLinkUrlTemplate,
                targetBlank: false,
            }]);
        }
    });

    let queryRunner: SceneQueryRunner;

    // Get current filter state
    const clusterFilter = clusterFilterService.getCurrentCluster();
    const instanceFilter = instanceFilterService.getCurrentInstance();

    // Apply active filters in order: cluster first, then instance (so the node
    // drilldown's instance scope overrides any per-instance hardcoded selectors
    // in the dashboard expressions).
    let finalExpr = options.expr;
    if (clusterFilter) {
        finalExpr = injectClusterFilter(finalExpr, clusterFilter);
    }
    if (instanceFilter) {
        finalExpr = injectInstanceFilter(finalExpr, instanceFilter);
    }

    queryRunner = new SceneQueryRunner({
        datasource: PROM_DATASOURCE_REF,
        queries: [{
            refId: metricName,
            expr: finalExpr,
        }],
    });

    // Description
    try {
        const descriptionMd = [
            `**Metric:** ${metricName} \n`,
            clusterFilter ? `**Cluster:** ${clusterFilter} \n` : '',
            instanceFilter ? `**Instance:** ${instanceFilter} \n` : '',
            '',
            '**Query:**',
            '```promql',
            finalExpr,
            '```',
        ].join('\n');
        panelBuilder.setDescription(descriptionMd);
    } catch (_e) { /* skip */ }

    if (options.unit) {
        panelBuilder.setUnit(options.unit);
    }

    const panel = panelBuilder.build();
    const dataTransformer = getNewTimeSeriesDataTransformer(queryRunner);

    // Generate unique panel ID
    const panelId = `panel-${metricName}-${++panelIdCounter}`;

    // Check if we should hide this panel when empty
    const shouldHideWhenEmpty = layoutService.getHideEmptyPanels();
    const flexItem = new SceneFlexItem({
        key: panelId,
        height: options.height ?? 300,
        width: panelWidth,
        minWidth: panelWidth === '100%' ? '100%' : '45%',
        body: panel,
        $data: dataTransformer,
        isHidden: false, // Start visible, will hide if no data
    });

    // If hideEmpty is enabled, add a behavior to watch data and toggle isHidden
    if (shouldHideWhenEmpty) {
        // Subscribe to data transformer state changes
        dataTransformer.subscribeToState((state) => {
            // Skip if still loading
            if (state.data?.state === 'Loading') {
                return;
            }

            const hasData = hasDataValues(state);
            const currentHidden = flexItem.state.isHidden;

            // Only update if state needs to change
            if (hasData && currentHidden) {
                flexItem.setState({ isHidden: false });
            } else if (!hasData && !currentHidden) {
                flexItem.setState({ isHidden: true });
            }
        });
    }

    return flexItem;
}
