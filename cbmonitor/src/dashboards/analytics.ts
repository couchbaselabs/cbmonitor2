import { SceneFlexItem } from '@grafana/scenes';
import type { MetricContext, ServiceBuilder } from './types';

/**
 * Unified panel emitter for the Analytics (cbas / Java) service. Two
 * process panels filtered by `proc="java"`, fourteen plain `cbas_*`
 * aggregates, and one extra-grouped `cbas_jobs_total` panel that splits
 * by the `result` label. All seventeen panels appear in both modes.
 */
export const analyticsBuilder: ServiceBuilder = (ctx) => {
    if (ctx.branch !== 'base') {
        return [];
    }
    return [
        // Process resources (java)
        ctx.panel('sysproc_cpu_seconds_total', `Java CPU Usage (cores)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (rate(sysproc_cpu_seconds_total{${ctx.jobSelector},proc="java"${ctx.instanceFilter}}[$__rate_interval]))`,
            legendFormat: ctx.legend(),
            unit: 'short',
        }),
        ctx.panel('sysproc_mem_resident', `Java Resident Memory (Bytes)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (sysproc_mem_resident{${ctx.jobSelector},proc="java"${ctx.instanceFilter}})`,
            legendFormat: ctx.legend(),
            unit: 'bytes',
        }),

        // cbas_* — counters wrapped in rate(), gauges raw.
        simpleCbasPanel(ctx, 'cbas_disk_used_bytes',            'Disk Used (Bytes)',                  'bytes',       false),
        simpleCbasPanel(ctx, 'cbas_direct_memory_used_bytes',   'Direct Memory Used (Bytes)',         'bytes',       false),
        simpleCbasPanel(ctx, 'cbas_gc_count_total',             'GC Events/Sec',                      'short',       true),
        simpleCbasPanel(ctx, 'cbas_gc_time_seconds_total',      'GC Time Rate (seconds-per-second)',  'percentunit', true),
        simpleCbasPanel(ctx, 'cbas_heap_memory_committed_bytes','Heap Memory Committed (Bytes)',      'bytes',       false),
        simpleCbasPanel(ctx, 'cbas_heap_memory_used_bytes',     'Heap Memory Used (Bytes)',           'bytes',       false),
        simpleCbasPanel(ctx, 'cbas_io_reads_total',             'IO Reads/Sec',                       'short',       true),
        simpleCbasPanel(ctx, 'cbas_io_writes_total',            'IO Writes/Sec',                      'short',       true),
        simpleCbasPanel(ctx, 'cbas_running_jobs',               'Running Jobs',                       'short',       false),
        simpleCbasPanel(ctx, 'cbas_queued_jobs',                'Queued Jobs',                        'short',       false),

        // Jobs by result — adds a `result` dimension to sum-by / legend.
        ctx.panel('cbas_jobs_total', `Jobs/Sec${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy('result')}) (rate(cbas_jobs_total{${ctx.jobSelector}${ctx.instanceFilter}}[$__rate_interval]))`,
            legendFormat: ctx.legend('result'),
            unit: 'short',
        }),

        simpleCbasPanel(ctx, 'cbas_system_load_average', 'System WorkLoad Average', 'short', false),
        simpleCbasPanel(ctx, 'cbas_requests_total',      'Received Requests/Sec',   'short', true),
        simpleCbasPanel(ctx, 'cbas_http_requests_total', 'HTTP Requests/Sec',       'short', true),
        simpleCbasPanel(ctx, 'cbas_thread_count',        'Thread Count',            'short', false),
    ];
};

function simpleCbasPanel(ctx: MetricContext, metric: string, title: string, unit: string, rate: boolean): SceneFlexItem {
    const inner = `${metric}{${ctx.jobSelector}${ctx.instanceFilter}}`;
    const series = rate ? `rate(${inner}[$__rate_interval])` : inner;
    return ctx.panel(metric, `${title}${ctx.titleSuffix}`, {
        expr: `sum by (${ctx.sumBy()}) (${series})`,
        legendFormat: ctx.legend(),
        unit,
    });
}

