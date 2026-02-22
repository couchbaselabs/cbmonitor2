// General utils for querying Couchbase cluster and handling data transformation
// Supports both Couchbase SQL++ and PromQL datasources

import { PanelBuilders, SceneDataTransformer, SceneFlexItem, SceneQueryRunner } from '@grafana/scenes';
import { TooltipDisplayMode, LegendDisplayMode } from '@grafana/schema';
import { CBQueryBuilder, AggregationQueryBuilder } from './utils.cbquery';
import { PromQueryBuilder, PromAggregationQueryBuilder } from './utils.promquery';
import { layoutService } from '../services/layoutService';
import { dataSourceService } from '../services/datasourceService';
import { DataSourceType } from '../types/datasource';

/** Union of all query builder types used by panels */
type AnyQueryBuilder = CBQueryBuilder | AggregationQueryBuilder | PromQueryBuilder | PromAggregationQueryBuilder;

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

// Common options shared between panel builders
type PanelCommonOptions = {
    labelFilters?: Record<string, string | string[]>;
    extraFields?: string[];
    unit?: string;
    width?: string;
    height?: number;
};

// Apply common builder options (label filters, extra fields)
function applyBuilderOptions(
    builder: AnyQueryBuilder,
    options: PanelCommonOptions
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

// Create a SceneFlexItem using a prepared builder and shared UI logic
function createSceneItemFromBuilder(
    builder: AnyQueryBuilder,
    metricName: string,
    title: string,
    options: PanelCommonOptions,
    extraDescriptionLines?: string[]
): SceneFlexItem {
    const panelWidth = options.width ?? layoutService.getPanelWidth();

    const panelBuilder = PanelBuilders.timeseries().setTitle(title);
    // Tooltip: show values from all series at the hovered time
    panelBuilder.setOption('tooltip', { mode: TooltipDisplayMode.Multi });
    // Legend: sort rendered entries by display name (lexicographic)
    panelBuilder.setOption('legend', {
        showLegend: true,
        placement: 'bottom',
        displayMode: LegendDisplayMode.List,
        sortBy: 'Name',
        sortDesc: false,
    });

    // Legend: prefer labels-only (extraFields) and fallback to instance label
    const makeLegendTemplate = (): string => {
        const ef = options.extraFields ?? [];
        const labelKeys = ef
            .map((f) => {
                // Expect formats like 'd.labels.instance' or 'd.labels.`database`'
                const matchBackticks = f.match(/d\.labels\.\`([^`]+)\`/);
                if (matchBackticks) {
                    return matchBackticks[1];
                }
                const matchDot = f.match(/d\.labels\.([^`\.]+)/);
                return matchDot ? matchDot[1] : undefined;
            })
            .filter((v): v is string => Boolean(v));

        if (labelKeys.length > 0) {
            // Build legend from labels only using field label macros
            const parts = labelKeys.map((k) => '${__field.labels.' + k + '}');
            return parts.join(' , ');
        }
        // Fallback: show instance label for clearer identification
        return '${__field.labels.instance}';
    };

    const legendTemplate = makeLegendTemplate();
    panelBuilder.setOverrides((b) => {
        // Match all fields coming from this query (by refId) and override display name
        b.matchFieldsByQuery(metricName).overrideDisplayName(legendTemplate);
    });

    // Add markdown description with query details
    const isPromQL = builder instanceof PromQueryBuilder || builder instanceof PromAggregationQueryBuilder;
    try {
        const queryText = builder.build();
        const queryLang = isPromQL ? 'promql' : 'sql';
        const dsLabel = isPromQL ? 'PromQL' : 'Couchbase SQL++ (experimental)';
        const descriptionMd = [
            `**Metric:** ${metricName} \n`,
            `**Datasource:** ${dsLabel} \n`,
            ...(extraDescriptionLines ?? []),
            '',
            '**Query:**',
            `\`\`\`${queryLang}`,
            queryText,
            '```',
        ].join('\n');
        panelBuilder.setDescription(descriptionMd);
    } catch (e) {
        // Skip description if query build fails
    }

    if (options.unit) {
        panelBuilder.setUnit(options.unit);
    }

    const panel = panelBuilder.build();

    return new SceneFlexItem({
        height: options.height ?? 300,
        width: panelWidth,
        minWidth: panelWidth === '100%' ? '100%' : '45%',
        body: panel,
        $data: getNewTimeSeriesDataTransformer(builder.buildQueryRunner()),
    });
}

/**
 * Create a new metric panel.
 * Automatically selects the query builder based on the current datasource:
 *   - Couchbase → CBQueryBuilder (SQL++)
 *   - PromQL → PromQueryBuilder
 */
export function createMetricPanel(
    snapshotId: string,
    metricName: string,
    title: string,
    options: PanelCommonOptions = {}
): SceneFlexItem {
    const ds = dataSourceService.getCurrentDataSource();
    if (process.env.NODE_ENV === 'development') {
        console.debug(`[Panel] createMetricPanel: ${metricName} using ${ds} datasource`);
    }
    const builder = ds === DataSourceType.PromQL
        ? new PromQueryBuilder(snapshotId, metricName)
        : new CBQueryBuilder(snapshotId, metricName);
    applyBuilderOptions(builder, options);
    return createSceneItemFromBuilder(builder, metricName, title, options);
}

/**
 * Create a new metric panel with an aggregation transform (e.g., rate, irate, increase).
 * Automatically selects the query builder based on the current datasource:
 *   - Couchbase → AggregationQueryBuilder (SQL++ with derived subquery)
 *   - PromQL → PromAggregationQueryBuilder (range-vector function)
 */
export function createAggregatedMetricPanel(
    snapshotId: string,
    metricName: string,
    title: string,
    options: {
        labelFilters?: Record<string, string | string[]>;
        extraFields?: string[];
        unit?: string;
        width?: string;
        height?: number;
        transformFunction?: string; // e.g., 'rate', 'irate', 'increase'
    } = {}
): SceneFlexItem {
    const ds = dataSourceService.getCurrentDataSource();
    if (process.env.NODE_ENV === 'development') {
        console.debug(`[Panel] createAggregatedMetricPanel: ${metricName} using ${ds} datasource with transform=${options.transformFunction}`);
    }

    let builder: AggregationQueryBuilder | PromAggregationQueryBuilder;
    if (ds === DataSourceType.PromQL) {
        const pb = new PromAggregationQueryBuilder(snapshotId, metricName);
        if (options.transformFunction) {
            pb.setTransformFunction(options.transformFunction);
        }
        builder = pb;
    } else {
        const cb = new AggregationQueryBuilder(snapshotId, metricName);
        if (options.transformFunction) {
            cb.setTransformFunction(options.transformFunction);
        }
        builder = cb;
    }
    applyBuilderOptions(builder, options);

    const extraDesc = options.transformFunction ? [`**Transform:** ${options.transformFunction}`] : undefined;
    return createSceneItemFromBuilder(builder, metricName, title, options, extraDesc);
}
