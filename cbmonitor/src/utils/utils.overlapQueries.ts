import { SceneQueryRunner, SceneFlexItem, PanelBuilders } from "@grafana/scenes";
import { TooltipDisplayMode, LegendDisplayMode } from '@grafana/schema';
import { PROM_DATASOURCE_REF } from "../constants";
import { layoutService } from '../services/layoutService';
import { getNewTimeSeriesDataTransformer } from './utils.panel';

// Placeholder pattern for snapshotIds in expressions
// Expressions should use: job="${snapshotIds}" which gets replaced with job="<snapshotId>" per query
const SNAPSHOT_PLACEHOLDER = '"${snapshotIds}"';

type OverlapPanelOptions = {
    // Metric name (will be wrapped in sum by (job, instance) automatically)
    // Or full PromQL expression with "${snapshotIds}" placeholder for job filter
    expr: string;
    // Snapshot IDs to compare
    snapshotIds: string[];
    // Additional labels to include in sum by (beyond job and instance)
    extraGroupBy?: string[];
    // Legend format suffix after "A - {{instance}}" (e.g., " , {{bucket}}")
    legendSuffix?: string;
    // Display unit
    unit?: string;
    // Panel width
    width?: string;
    // Panel height
    height?: number;
};

/**
 * Build baseline expression with sum by (job, instance, ...).
 * If expr already contains "sum by", use it as-is.
 * Otherwise wrap: sum by (job, instance) (metric{job="..."})
 */
function buildBaselineExpr(expr: string, extraGroupBy?: string[]): string {
    // If already has sum by, return as-is
    if (expr.toLowerCase().includes('sum by') || expr.toLowerCase().includes('sum(')) {
        return expr;
    }
    
    // Build group by labels
    const groupLabels = ['job', 'instance', ...(extraGroupBy ?? [])].join(', ');
    
    // Check if expr has a selector already
    if (expr.includes('{')) {
        return `sum by (${groupLabels}) (${expr})`;
    }
    
    // Plain metric name - add job filter placeholder
    return `sum by (${groupLabels}) (${expr}{job${SNAPSHOT_PLACEHOLDER}})`;
}

/**
 * Create an overlap metric panel for comparing multiple snapshots.
 * All expressions are automatically wrapped with sum by (job, instance).
 * Legend shows: A - {{instance}}, B - {{instance}}, etc.
 * 
 * Usage:
 * ```ts
 * // Simple - just metric name
 * createOverlapMetricPanel('sys_cpu_utilization_rate', 'CPU Utilization', {
 *     snapshotIds: ['snap1', 'snap2'],
 *     unit: 'percent',
 * })
 * 
 * // With extra group by labels
 * createOverlapMetricPanel('couch_docs_actual_disk_size', 'Disk Size', {
 *     snapshotIds: ['snap1', 'snap2'],
 *     extraGroupBy: ['bucket'],
 *     legendSuffix: ' , {{bucket}}',
 *     unit: 'bytes',
 * })
 * ```
 */
export function createOverlapMetricPanel(
    metricName: string,
    title: string,
    options: OverlapPanelOptions
): SceneFlexItem {
    const {
        expr,
        snapshotIds,
        extraGroupBy,
        legendSuffix = '',
        unit,
        width,
        height = 300,
    } = options;

    const panelWidth = width ?? layoutService.getPanelWidth();
    
    // Build baseline expression with sum by (job, instance, ...)
    const baselineExpr = buildBaselineExpr(expr, extraGroupBy);

    // Build one query per snapshot with letter prefix (A, B, C, ...)
    const queries = snapshotIds.map((snapshotId, index) => {
        const letter = String.fromCharCode(index + 65); // 0 -> 'A', 1 -> 'B', etc.
        const expandedExpr = baselineExpr.replace(SNAPSHOT_PLACEHOLDER, `="${snapshotId}"`);
        return {
            refId: `${metricName}_${letter}`,
            expr: expandedExpr,
            legendFormat: `${letter} - {{instance}}${legendSuffix}`,
        };
    });

    const queryRunner = new SceneQueryRunner({
        datasource: PROM_DATASOURCE_REF,
        queries,
    });

    const panelBuilder = PanelBuilders.timeseries().setTitle(title);
    panelBuilder.setOption('tooltip', { mode: TooltipDisplayMode.Multi });
    panelBuilder.setOption('legend', {
        showLegend: true,
        placement: 'bottom',
        displayMode: LegendDisplayMode.List,
        sortBy: 'Name',
        sortDesc: false,
    });

    // Apply legend display name override for each query
    // Convert {{label}} to ${__field.labels.label} for Grafana overrides
    const legendSuffixConverted = legendSuffix.replace(/\{\{(\w+)\}\}/g, '${__field.labels.$1}');
    panelBuilder.setOverrides((b) => {
        snapshotIds.forEach((_, index) => {
            const letter = String.fromCharCode(index + 65);
            const refId = `${metricName}_${letter}`;
            b.matchFieldsByQuery(refId).overrideDisplayName(`${letter} - \${__field.labels.instance}${legendSuffixConverted}`);
        });
    });

    if (unit) {
        panelBuilder.setUnit(unit);
    }

    // Add description with query info
    try {
        const queryLines = queries.map(q => `${q.refId}: ${q.expr}`).join('\n');
        const descriptionMd = [
            `**Metric:** ${metricName} \n` ,
            `**Snapshots:** ${snapshotIds.map((s, i) => `${String.fromCharCode(i + 65)}=${s}`).join(', ')} \n`,
            `**Mode:** Overlap Comparison \n`,
            '',
            '**Queries:**',
            '```promql',
            queryLines,
            '```',
        ].join('\n');
        panelBuilder.setDescription(descriptionMd);
    } catch (_e) { /* skip */ }

    const panel = panelBuilder.build();

    return new SceneFlexItem({
        height,
        width: panelWidth,
        minWidth: panelWidth === '100%' ? '100%' : '45%',
        body: panel,
        $data: getNewTimeSeriesDataTransformer(queryRunner),
    });
}
