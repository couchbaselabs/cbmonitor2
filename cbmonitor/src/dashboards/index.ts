import { SceneFlexItem } from '@grafana/scenes';
import type { MetricContext, ServiceBuilder } from './types';

// TODO: add a way to select which indexes you want to compare

/**
 * Detail metrics whose shape is identical (raw `{metric}` selector, legend
 * by `bucket` / `index`, optional unit). Single mode emits these as
 * per-instance deep-dives + an aggregated fallback when no instances are
 * discovered. Overlap mode emits them aggregated in `base` via
 * `sum by (job[, instance], bucket, index)`.
 */
const INDEX_DETAIL_METRICS: ReadonlyArray<[metric: string, title: string, unit: string]> = [
    ['index_avg_scan_latency',  'Index Avg Scan Latency',                'ns'],
    ['index_cache_hits',        'Index Cache Hits',                      'short'],
    ['index_cache_misses',      'Index Cache Misses',                    'short'],
    ['index_num_requests',      'Index Number of Requests',              'short'],
    ['index_num_rows_returned', 'Index Number of Rows Returned',         'short'],
    ['index_num_docs_indexed',  'Index Number of Documents Indexed',     'short'],
    ['index_items_count',       'Index Items Count',                     'short'],
    ['index_disk_size',         'Index Disk Size',                       'bytes'],
    ['index_avg_item_size',     'Index Average Item Size',               'bytes'],
];

/**
 * Unified panel emitter for the Index service.
 *
 * Mode divergence (preserved from originals):
 * - 7 standard base panels appear in both modes' `base` branch.
 * - Overlap `base` additionally emits 10 aggregated detail panels
 *   (index_memory_used + the 9 INDEX_DETAIL_METRICS) via `sum by (…,
 *   bucket, index[, scope, collection])`.
 * - Single `perInstance` emits the same 10 metrics filtered to one
 *   instance with raw (un-summed) selectors.
 * - Single `fallback` emits the 9 detail metrics aggregated across all
 *   instances. NOTE: `index_memory_used` is deliberately absent from
 *   fallback in the original — preserved.
 */
export const indexBuilder: ServiceBuilder = (ctx) => {
    if (ctx.branch === 'base') {
        return [
            // Indexer process resources
            ctx.panel('sysproc_cpu_seconds_total', `Indexer CPU Usage (cores)${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy()}) (rate(sysproc_cpu_seconds_total{${ctx.jobSelector},proc="indexer"${ctx.instanceFilter}}[$__rate_interval]))`,
                legendFormat: ctx.legend(),
                unit: 'short',
            }),
            ctx.panel('sysproc_mem_resident', `Indexer Resident Memory (Bytes)${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy()}) (sysproc_mem_resident{${ctx.jobSelector},proc="indexer"${ctx.instanceFilter}})`,
                legendFormat: ctx.legend(),
                unit: 'bytes',
            }),

            // Throughput / footprint gauges aggregated by instance
            simpleIndexPanel(ctx, 'index_avg_disk_bps',      'Index Disk Bytes per Second',         'binBps'),
            simpleIndexPanel(ctx, 'index_avg_mutation_rate', 'Index Mutation Rate',                 'ops'),
            simpleIndexPanel(ctx, 'index_net_avg_scan_rate', 'Index Average Scan Rate',             'ops'),
            simpleIndexPanel(ctx, 'index_memory_rss',        'Indexer Process Resident Set Size',   'bytes'),
            simpleIndexPanel(ctx, 'index_total_data_size',   'Index Total Data Size',               'bytes'),

            // Detail metrics: aggregated in overlap base, deep-dived in
            // single's perInstance / fallback branches.
            ...ctx.modeOnly(['overlap'], [
                overlapMemoryUsedPanel(ctx),
                ...INDEX_DETAIL_METRICS.map(([metric, title, unit]) => overlapDetailPanel(ctx, metric, title, unit)),
            ]),
        ];
    }

    if (ctx.branch === 'perInstance') {
        const i = ctx.perInstance!;
        return [
            singleMemoryUsedPanel(ctx, i),
            ...INDEX_DETAIL_METRICS.map(([metric, title, unit]) => singleDetailPanelForInstance(ctx, metric, title, unit, i)),
        ];
    }

    // branch === 'fallback' (single only — no instances discovered).
    // index_memory_used is intentionally absent here (original behavior).
    return INDEX_DETAIL_METRICS.map(([metric, title, unit]) => singleDetailPanelAggregated(ctx, metric, title, unit));
};

function simpleIndexPanel(ctx: MetricContext, metric: string, title: string, unit: string): SceneFlexItem {
    return ctx.panel(metric, `${title}${ctx.titleSuffix}`, {
        expr: `sum by (${ctx.sumBy()}) (${metric}{${ctx.jobSelector}${ctx.instanceFilter}})`,
        legendFormat: ctx.legend(),
        unit,
    });
}

function overlapMemoryUsedPanel(ctx: MetricContext): SceneFlexItem {
    return ctx.panel('index_memory_used', `Index Memory Used${ctx.titleSuffix}`, {
        expr: `sum by (${ctx.sumBy('bucket', 'index', 'scope', 'collection')}) (index_memory_used{${ctx.jobSelector}${ctx.instanceFilter}})`,
        legendFormat: ctx.legend('bucket', 'index', 'scope', 'collection'),
        unit: 'bytes',
    });
}

function overlapDetailPanel(ctx: MetricContext, metric: string, title: string, unit: string): SceneFlexItem {
    return ctx.panel(metric, `${title}${ctx.titleSuffix}`, {
        expr: `sum by (${ctx.sumBy('bucket', 'index')}) (${metric}{${ctx.jobSelector}${ctx.instanceFilter}})`,
        legendFormat: ctx.legend('bucket', 'index'),
        unit,
    });
}

function singleMemoryUsedPanel(ctx: MetricContext, i: string): SceneFlexItem {
    return ctx.panel('index_memory_used', `Index Memory Used (${i})`, {
        expr: `index_memory_used{${ctx.jobSelector}, instance="${i}"}`,
        legendFormat: '{{bucket}} , {{index}} , {{scope}} , {{collection}}',
        unit: 'bytes',
    });
}

function singleDetailPanelForInstance(ctx: MetricContext, metric: string, title: string, unit: string, i: string): SceneFlexItem {
    return ctx.panel(metric, `${title} (${i})`, {
        expr: `${metric}{${ctx.jobSelector},instance="${i}"}`,
        legendFormat: '{{bucket}} , {{index}}',
        unit,
    });
}

function singleDetailPanelAggregated(ctx: MetricContext, metric: string, title: string, unit: string): SceneFlexItem {
    return ctx.panel(metric, title, {
        expr: `${metric}{${ctx.jobSelector}}`,
        legendFormat: '{{bucket}} , {{index}}',
        unit,
    });
}

