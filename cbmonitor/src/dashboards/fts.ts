import { SceneFlexItem } from '@grafana/scenes';
import type { MetricContext, ServiceBuilder } from './types';

/**
 * Unified panel emitter for the FTS (Search) service. Thirteen panels
 * shared across both modes: two process panels filtered by `proc="cbft"`
 * plus eleven `fts_*` rate/gauge panels. No per-instance branch.
 */
export const ftsBuilder: ServiceBuilder = (ctx) => {
    if (ctx.branch !== 'base') {
        return [];
    }
    return [
        // Process resources (cbft)
        ctx.panel('sysproc_cpu_seconds_total', `Search CPU Usage (cores)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (rate(sysproc_cpu_seconds_total{${ctx.jobSelector},proc="cbft"${ctx.instanceFilter}}[$__rate_interval]))`,
            legendFormat: ctx.legend(),
            labelFilters: { proc: 'cbft' },
            transformFunction: 'rate',
            unit: 'short',
        }),
        ctx.panel('sysproc_mem_resident', `Search Resident Memory (Bytes)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (sysproc_mem_resident{${ctx.jobSelector},proc="cbft"${ctx.instanceFilter}})`,
            legendFormat: ctx.legend(),
            labelFilters: { proc: 'cbft' },
            unit: 'bytes',
        }),

        // fts_* — counters wrapped in rate(), gauges raw.
        simpleFtsPanel(ctx, 'fts_total_queries',             'Queries/Sec',                 'short', true),
        simpleFtsPanel(ctx, 'fts_total_request_time',        'Request Time Rate (ns/sec)',  'short', true),
        simpleFtsPanel(ctx, 'fts_total_queries_error',       'Queries Error/Sec',           'short', true),
        simpleFtsPanel(ctx, 'fts_total_bytes_query_results', 'Query Result Bytes/Sec',      'Bps',   true),
        simpleFtsPanel(ctx, 'fts_total_queries_slow',        'Queries Slow/Sec',            'short', true),
        simpleFtsPanel(ctx, 'fts_total_queries_timeout',     'Queries Timeout/Sec',         'short', true),
        simpleFtsPanel(ctx, 'fts_total_gc',                  'GC Events/Sec',               'short', true),
        simpleFtsPanel(ctx, 'fts_pct_cpu_gc',                'CPU GC (%)',                  'percent', false),
        simpleFtsPanel(ctx, 'fts_num_bytes_used_disk',       'Disk Usage (Bytes)',          'bytes', false),
        simpleFtsPanel(ctx, 'fts_num_files_on_disk',         'Number of Files on Disk',     'short', false),
        simpleFtsPanel(ctx, 'fts_num_bytes_used_ram',        'RAM Usage (Bytes)',           'bytes', false),
    ];
};

function simpleFtsPanel(ctx: MetricContext, metric: string, title: string, unit: string, rate: boolean): SceneFlexItem {
    const inner = `${metric}{${ctx.jobSelector}${ctx.instanceFilter}}`;
    const series = rate ? `rate(${inner}[$__rate_interval])` : inner;
    return ctx.panel(metric, `${title}${ctx.titleSuffix}`, {
        expr: `sum by (${ctx.sumBy()}) (${series})`,
        legendFormat: ctx.legend(),
        ...(rate ? { transformFunction: 'rate' } : {}),
        unit,
    });
}

