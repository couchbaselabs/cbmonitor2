// Panel creation utilities with hardcoded PromQL expressions as the source of truth.
// SQL++ queries are still generated from parameters via CBQueryBuilder when that datasource is active.
// In the future, SQL++ queries will be derived from the PromQL expressions.

import { PanelBuilders, SceneDataTransformer, SceneFlexItem, SceneFlexLayout, SceneQueryRunner, SceneDataState } from '@grafana/scenes';
import { TooltipDisplayMode, LegendDisplayMode } from '@grafana/schema';
import { CBQueryBuilder, AggregationQueryBuilder } from './utils.cbquery';
import { layoutService } from '../services/layoutService';
import { dataSourceService } from '../services/datasourceService';
import { clusterFilterService } from '../services/clusterFilterService';
import { DataSourceType } from '../types/datasource';
import { PROM_DATASOURCE_REF } from '../constants';

// Global counter for unique panel IDs
let panelIdCounter = 0;

/**
 * Check if data state has actual data values
 */
function hasDataValues(dataState: SceneDataState | undefined): boolean {
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

/**
 * Create a SceneFlexLayout - simple wrapper for consistency.
 */
export function createFlexLayout(options: {
    direction?: 'row' | 'column';
    wrap?: 'wrap' | 'nowrap';
    minHeight?: number;
    children: SceneFlexItem[];
}): SceneFlexLayout {
    const { direction = 'row', wrap = 'wrap', minHeight = 50, children } = options;
    
    return new SceneFlexLayout({
        direction,
        wrap,
        minHeight,
        children,
    });
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
    width?: string;
    height?: number;
};

// Apply label filters and extra fields to a CBQueryBuilder
function applyCBBuilderOptions(
    builder: CBQueryBuilder,
    options: PanelOptions
) {
    if (options.labelFilters) {
        for (const [label, value] of Object.entries(options.labelFilters)) {
            builder.addLabelFilter(label, value);
        }
    }
    if (options.extraFields) {
        builder.setExtraFields(options.extraFields);
    }
}

// Build legend template for Grafana panel display name override
function makeLegendTemplate(extraFields?: string[]): string {
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
function injectClusterFilter(expr: string, clusterId: string): string {
    // Only inject into metric selectors that already have a label block {....}
    // This avoids matching PromQL keywords like sum, by, rate, instance, etc.
    // Match: metric_name{labels...} and inject cluster_uuid before closing brace
    return expr.replace(/(\w+)\{([^}]*)\}/g, (_match, metric, labels) => {
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
 * Create a metric panel with a hardcoded PromQL expression (source of truth).
 *
 * When the active datasource is PromQL, uses the hardcoded `expr` directly.
 * When the active datasource is Couchbase SQL++, builds a query via CBQueryBuilder
 * using `snapshotId`, `labelFilters`, `extraFields`, and optionally `transformFunction`.
 *
 * @param metricName - Metric / refId identifier
 * @param title - Panel display title
 * @param options - Panel options (PromQL expr + SQL++ params + display settings)
 */
export function createMetricPanel(
    metricName: string,
    title: string,
    options: PanelOptions
): SceneFlexItem {
    const panelWidth = options.width ?? layoutService.getPanelWidth();
    const ds = dataSourceService.getCurrentDataSource();
    const isPrometheus = ds === DataSourceType.Prometheus;

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
    panelBuilder.setOverrides((b) => {
        b.matchFieldsByQuery(metricName).overrideDisplayName(legendTemplate);
    });

    let queryRunner: SceneQueryRunner;

    // Get current cluster filter
    const clusterFilter = clusterFilterService.getCurrentCluster();

    if (isPrometheus) {
        // --- PromQL path: use hardcoded expression directly ---
        // If cluster filter is active, inject it into the PromQL expression
        const finalExpr = clusterFilter ? injectClusterFilter(options.expr, clusterFilter) : options.expr;

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
                `**Datasource:** PromQL \n`,
                clusterFilter ? `**Cluster:** ${clusterFilter} \n` : '',
                '',
                '**Query:**',
                '```promql',
                finalExpr,
                '```',
            ].join('\n');
            panelBuilder.setDescription(descriptionMd);
        } catch (_e) { /* skip */ }
    } else {
        // --- SQL++ path: build via CBQueryBuilder ---
        let builder: CBQueryBuilder;
        if (options.transformFunction) {
            const aggBuilder = new AggregationQueryBuilder(options.snapshotId, metricName);
            aggBuilder.setTransformFunction(options.transformFunction);
            builder = aggBuilder;
        } else {
            builder = new CBQueryBuilder(options.snapshotId, metricName);
        }
        applyCBBuilderOptions(builder, options);

        // If cluster filter is active, add it to the query
        if (clusterFilter) {
            builder.addLabelFilter('cluster', clusterFilter);
        }

        queryRunner = builder.buildQueryRunner();

        // Description
        try {
            const queryText = builder.build();
            const extraDesc = options.transformFunction ? [`**Transform:** ${options.transformFunction}`] : [];
            const descriptionMd = [
                `**Metric:** ${metricName} \n`,
                `**Datasource:** Couchbase SQL++ (experimental) \n`,
                ...extraDesc,
                '',
                '**Query:**',
                '```sql',
                queryText,
                '```',
            ].join('\n');
            panelBuilder.setDescription(descriptionMd);
        } catch (_e) { /* skip */ }
    }

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
