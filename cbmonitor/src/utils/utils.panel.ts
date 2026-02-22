// Panel creation utilities with hardcoded PromQL expressions as the source of truth.
// SQL++ queries are still generated from parameters via CBQueryBuilder when that datasource is active.
// In the future, SQL++ queries will be derived from the PromQL expressions.

import { PanelBuilders, SceneDataTransformer, SceneFlexItem, SceneQueryRunner } from '@grafana/scenes';
import { TooltipDisplayMode, LegendDisplayMode } from '@grafana/schema';
import { CBQueryBuilder, AggregationQueryBuilder } from './utils.cbquery';
import { layoutService } from '../services/layoutService';
import { dataSourceService } from '../services/datasourceService';
import { DataSourceType } from '../types/datasource';
import { PROM_DATASOURCE_REF } from '../constants';

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

// Build legend template for Grafana panel display name override (SQL++ path)
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
    const isPromQL = ds === DataSourceType.PromQL;

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

    if (isPromQL) {
        // --- PromQL path: use hardcoded expression directly ---
        queryRunner = new SceneQueryRunner({
            datasource: PROM_DATASOURCE_REF,
            queries: [{
                refId: metricName,
                expr: options.expr,
            }],
        });

        // Description
        try {
            const descriptionMd = [
                `**Metric:** ${metricName} \n`,
                `**Datasource:** PromQL \n`,
                '',
                '**Query:**',
                '```promql',
                options.expr,
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

    return new SceneFlexItem({
        height: options.height ?? 300,
        width: panelWidth,
        minWidth: panelWidth === '100%' ? '100%' : '45%',
        body: panel,
        $data: getNewTimeSeriesDataTransformer(queryRunner),
    });
}
