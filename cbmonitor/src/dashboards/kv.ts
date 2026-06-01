import { SceneFlexItem } from '@grafana/scenes';
import type { MetricContext, ServiceBuilder } from './types';

/**
 * Unified panel emitter for the KV / memcached service.
 *
 * Mode divergence:
 * - `kv_ops_by_type` (sum by `op`) is single-only.
 * - `kv_ops` is the per-instance deep-dive in single (bucket/op/result
 *   breakdown filtered to one instance) but appears in `base` for overlap
 *   at full width with `sum by (… bucket, op, result)`.
 * - The four DCP panels use a raw `rate()` selector in single (no `sum
 *   by`) but a `sum by (job[, instance], bucket, connection_type)`
 *   aggregate in overlap. The `dcpPanel` helper preserves that exactly.
 */
export const kvBuilder: ServiceBuilder = (ctx) => {
    if (ctx.branch === 'base') {
        return [
            // Memcached process resources
            ctx.panel('sysproc_cpu_seconds_total', `memcached CPU Usage (cores)${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy()}) (rate(sysproc_cpu_seconds_total{${ctx.jobSelector},proc="memcached"${ctx.instanceFilter}}[$__rate_interval]))`,
                legendFormat: ctx.legend(),
                labelFilters: { proc: 'memcached' },
                transformFunction: 'rate',
                unit: 'short',
            }),
            ctx.panel('sysproc_mem_resident', `memcached Resident Memory (Bytes)${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy()}) (sysproc_mem_resident{${ctx.jobSelector},proc="memcached"${ctx.instanceFilter}})`,
                legendFormat: ctx.legend(),
                labelFilters: { proc: 'memcached' },
                unit: 'bytes',
            }),
            // Resident ratio is reported per bucket and vBucket state
            // (active/replica/pending). We split active vs replica (pending
            // dropped)
            ctx.panel('kv_vb_perc_mem_resident_ratio', `vBucket Memory Resident Ratio (%)${ctx.titleSuffix}`, {
                expr: `avg by (${ctx.mode === 'overlap' ? 'job, bucket, state' : 'bucket, state'}) (kv_vb_perc_mem_resident_ratio{${ctx.jobSelector},state=~"active|replica"})`,
                legendFormat: ctx.mode === 'overlap' ? '{{job}} , {{bucket}} , {{state}}' : '{{bucket}} , {{state}}',
                labelFilters: { state: ['active', 'replica'] },
                extraFields: ['d.labels.`bucket`', 'd.labels.`state`'],
                unit: 'percentunit',
            }),

            // Operations & Performance
            ctx.panel('kv_vb_ops_get', `vBucket GET Ops/Sec${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy('bucket')}) (rate(kv_vb_ops_get{${ctx.jobSelector}${ctx.instanceFilter}}[$__rate_interval]))`,
                legendFormat: ctx.legend('bucket'),
                transformFunction: 'rate',
                extraFields: ['d.labels.`instance`', 'd.labels.`bucket`'],
                unit: 'short',
            }),

            // Workload mix: ops/sec broken out by operation type across all
            // buckets/instances. Single-only — sum-by is just `op` (no
            // instance), which doesn't fit ctx.sumBy()'s instance-first
            // shape, so hardcoded.
            ...ctx.modeOnly(['single'], [
                ctx.panel('kv_ops_by_type', 'KV Operations by Type (ops/sec)', {
                    expr: `sum by (op) (rate(kv_ops{${ctx.jobSelector}}[$__rate_interval]))`,
                    legendFormat: '{{op}}',
                    transformFunction: 'rate',
                    extraFields: ['d.labels.`op`'],
                    unit: 'short',
                }),
            ]),

            // Data & items
            simpleKvPanel(ctx, 'kv_curr_items',         'Current Items Count',          'short', false),
            simpleKvPanel(ctx, 'kv_curr_connections',   'Current Connections Count',    'short', false),

            // Memory
            simpleKvPanel(ctx, 'kv_mem_used_bytes',           'KV Memory Usage (Bytes)',       'bytes', false),
            simpleKvPanel(ctx, 'kv_ep_meta_data_memory_bytes','Metadata Memory Usage (Bytes)', 'bytes', false),

            // Disk queues
            simpleKvPanel(ctx, 'kv_ep_diskqueue_fill',  'KV Engine Disk Queue Fill',  'short', false),
            simpleKvPanel(ctx, 'kv_ep_diskqueue_drain', 'KV Engine Disk Queue Drain', 'short', false),

            // Internal queues
            simpleKvPanel(ctx, 'kv_ep_queue_size',       'KV Engine Queue Size',         'short', false),
            simpleKvPanel(ctx, 'kv_vb_queue_size',       'vBucket Queue Size',           'short', false),
            simpleKvPanel(ctx, 'kv_vb_queue_age_seconds','vBucket Queue Age (Seconds)',  's',     false),

            // DCP — mode-asymmetric expr shape; see helper.
            dcpPanel(ctx, 'kv_dcp_items_sent',       'DCP Items Sent (Items/Sec)',    'short', true),
            dcpPanel(ctx, 'kv_dcp_connection_count', 'Current DCP Connection Count',  'short', false),
            dcpPanel(ctx, 'kv_dcp_backoff',          'DCP Backoff',                   'short', false),
            dcpPanel(ctx, 'kv_dcp_items_remaining',  'DCP Items Remaining',           'short', false),

            // kv_ops full breakdown — overlap only (single emits a
            // per-instance variant below).
            ...ctx.modeOnly(['overlap'], [
                ctx.panel('kv_ops', `KV Operations/Sec${ctx.titleSuffix}`, {
                    expr: `sum by (${ctx.sumBy('bucket', 'op', 'result')}) (rate(kv_ops{${ctx.jobSelector}${ctx.instanceFilter}}[$__rate_interval]))`,
                    legendFormat: ctx.legend('bucket', 'op', 'result'),
                    unit: 'short',
                    width: '100%',
                }),
            ]),
        ];
    }

    if (ctx.branch === 'perInstance') {
        const i = ctx.perInstance!;
        return [
            ctx.panel('kv_ops', `KV Operations/Sec (${i})`, {
                expr: `rate(kv_ops{${ctx.jobSelector},instance="${i}"}[$__rate_interval])`,
                legendFormat: '{{bucket}} , {{op}} , {{result}}',
                labelFilters: { instance: i },
                extraFields: ['d.labels.`bucket`', 'd.labels.`op`', 'd.labels.`result`'],
                transformFunction: 'rate',
                unit: 'short',
            }),
        ];
    }

    // branch === 'fallback' (single only — no instances discovered).
    return [
        ctx.panel('kv_ops', 'KV Operations/Sec', {
            expr: `rate(kv_ops{${ctx.jobSelector}}[$__rate_interval])`,
            legendFormat: '{{instance}} , {{bucket}} , {{op}} , {{result}}',
            extraFields: ['d.labels.`instance`', 'd.labels.`bucket`', 'd.labels.`op`', 'd.labels.`result`'],
            transformFunction: 'rate',
            unit: 'short',
        }),
    ];
};

function simpleKvPanel(ctx: MetricContext, metric: string, title: string, unit: string, rate: boolean): SceneFlexItem {
    const inner = `${metric}{${ctx.jobSelector}${ctx.instanceFilter}}`;
    const series = rate ? `rate(${inner}[$__rate_interval])` : inner;
    return ctx.panel(metric, `${title}${ctx.titleSuffix}`, {
        expr: `sum by (${ctx.sumBy()}) (${series})`,
        legendFormat: ctx.legend(),
        ...(rate ? { transformFunction: 'rate' } : {}),
        unit,
    });
}

/**
 * DCP panels: single mode uses a raw selector (no `sum by`) so every
 * native label combo becomes a series; overlap mode explicitly
 * aggregates by `bucket` and `connection_type` (plus job/instance via
 * ctx.sumBy). The two shapes are equivalent only if those are the
 * metric's only labels — preserving each verbatim avoids any
 * regression on metrics with additional dimensions.
 */
function dcpPanel(ctx: MetricContext, metric: string, title: string, unit: string, rate: boolean): SceneFlexItem {
    const inner = `${metric}{${ctx.jobSelector}${ctx.instanceFilter}}`;
    const series = rate ? `rate(${inner}[$__rate_interval])` : inner;
    const expr = ctx.mode === 'single'
        ? series
        : `sum by (${ctx.sumBy('bucket', 'connection_type')}) (${series})`;
    return ctx.panel(metric, `${title}${ctx.titleSuffix}`, {
        expr,
        legendFormat: ctx.legend('bucket', 'connection_type'),
        ...(rate ? { transformFunction: 'rate' } : {}),
        extraFields: ['d.labels.`instance`', 'd.labels.`bucket`', 'd.labels.`connection_type`'],
        unit,
    });
}

