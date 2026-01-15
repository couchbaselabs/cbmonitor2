// General utils for querying Couchbase cluster and handling data transformation
// using the cbdatasource plugin

import { PanelBuilders, SceneDataTransformer, SceneFlexItem, SceneQueryRunner } from '@grafana/scenes';
import { TooltipDisplayMode } from '@grafana/schema';
import { CBQueryBuilder, AggregationQueryBuilder } from './utils.cbquery';
import { layoutService } from '../services/layoutService';

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
    builder: CBQueryBuilder | AggregationQueryBuilder,
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
    builder: CBQueryBuilder | AggregationQueryBuilder,
    metricName: string,
    title: string,
    options: PanelCommonOptions,
    extraDescriptionLines?: string[]
): SceneFlexItem {
    const panelWidth = options.width ?? layoutService.getPanelWidth();

    const panelBuilder = PanelBuilders.timeseries().setTitle(title);
    // Tooltip: show values from all series at the hovered time
    panelBuilder.setOption('tooltip', { mode: TooltipDisplayMode.Multi });

    // Legend: prefer labels-only (extraFields) and fallback to metric name
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
    try {
        const queryText = builder.build();
        const descriptionMd = [
            `**Metric:** ${metricName}`,
            ...(extraDescriptionLines ?? []),
            '',
            '**Query:**',
            '```sql',
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
 * Create a new metric panel using the CBQueryBuilder and TimeSeriesDataTransformer
 */
export function createMetricPanel(
    snapshotId: string,
    metricName: string,
    title: string,
    options: PanelCommonOptions = {}
): SceneFlexItem {
    const builder = new CBQueryBuilder(snapshotId, metricName);
    applyBuilderOptions(builder, options);
    return createSceneItemFromBuilder(builder, metricName, title, options);
}

/**
 * Create a new metric panel using AggregationQueryBuilder and TimeSeriesDataTransformer
 *
 * This mirrors createMetricPanel but builds the query via AggregationQueryBuilder,
 * allowing a timeseries transform (e.g., rate) to be applied before expansion.
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
        transformFunction?: string; // e.g., 'rate', 'avg_timeseries'
    } = {}
): SceneFlexItem {
    const builder = new AggregationQueryBuilder(snapshotId, metricName);
    if (options.transformFunction) {
        builder.setTransformFunction(options.transformFunction);
    }
    applyBuilderOptions(builder, options);

    const extraDesc = options.transformFunction ? [`**Transform:** ${options.transformFunction}`] : undefined;
    return createSceneItemFromBuilder(builder, metricName, title, options, extraDesc);
}

