import { SceneFlexItem } from '@grafana/scenes';
import type { MetricContext, ServiceBuilder } from './types';

/**
 * Unified panel emitter for the Query Engine service. Twelve panels are
 * shared with overlap (process resources + n1ql_* counters/gauges — all
 * counters are plotted as rates, `n1ql_active_requests` is the only gauge);
 * two tail-latency overlay panels (p50/p95/p99 and mean/max via
 * `label_replace`) are single-only and gated by `ctx.modeOnly(['single'])`.
 *
 * Tail-latency overlays preserve the original divergence — they use
 * `sum by (instance)` and a hardcoded snapshot job selector which don't
 * translate cleanly to overlap. Promoting them to both modes would
 * require an overlap-friendly `sum by (job, instance)` rewrite; out of
 * scope for the refactor.
 */
export const queryBuilder: ServiceBuilder = (ctx) => {
    if (ctx.branch !== 'base') {
        return [];
    }
    return [
        // Process resources (cbq-engine)
        ctx.panel('sysproc_cpu_seconds_total', `Query Engine CPU Usage (cores)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (rate(sysproc_cpu_seconds_total{${ctx.jobSelector},proc="cbq-engine"${ctx.instanceFilter}}[$__rate_interval]))`,
            legendFormat: ctx.legend(),
            labelFilters: { proc: 'cbq-engine' },
            extraFields: ['d.labels.`instance`', 'd.labels.`mode`'],
            transformFunction: 'rate',
            unit: 'short',
        }),
        ctx.panel('sysproc_mem_resident', `Query Engine Resident Memory (Bytes)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (sysproc_mem_resident{${ctx.jobSelector},proc="cbq-engine"${ctx.instanceFilter}})`,
            legendFormat: ctx.legend(),
            labelFilters: { proc: 'cbq-engine' },
            unit: 'bytes',
        }),

        // n1ql counters / gauges — all share the same plain-aggregate shape.
        // Per the query-service metrics reference, all of these except
        // n1ql_active_requests are counters, so they're plotted as
        // per-second rates rather than raw cumulative totals.
        simpleN1qlPanel(ctx, 'n1ql_requests',         'Query Requests/Sec',           'short', true),
        simpleN1qlPanel(ctx, 'n1ql_selects',          'Query Selects/Sec',            'short', true),
        simpleN1qlPanel(ctx, 'n1ql_active_requests',  'Query Active Requests',        'short', false),
        simpleN1qlPanel(ctx, 'n1ql_requests_250ms',   'Query Requests > 250ms/Sec',   'short', true),
        simpleN1qlPanel(ctx, 'n1ql_requests_500ms',   'Query Requests > 500ms/Sec',   'short', true),
        simpleN1qlPanel(ctx, 'n1ql_requests_1000ms',  'Query Requests > 1000ms/Sec',  'short', true),
        simpleN1qlPanel(ctx, 'n1ql_errors',           'Query Errors/Sec',             'short', true),
        simpleN1qlPanel(ctx, 'n1ql_result_count',     'Query Result Count/Sec',       'short', true),
        simpleN1qlPanel(ctx, 'n1ql_result_size',      'Query Result Size/Sec',        'Bps',  true),
        simpleN1qlPanel(ctx, 'n1ql_invalid_requests', 'Query Invalid Requests/Sec',   'short', true),

        // Request-time tail latency. Server exports these as pre-computed
        // gauges (ns), plotted directly via label_replace overlay. Single
        // only — overlap version would need a different sum-by shape and
        // is intentionally absent today.
        ...ctx.modeOnly(['single'], [
            ctx.panel('n1ql_request_timer_percentiles', 'Query Request Time — p50 / p95 / p99', {
                expr: `
                  label_replace(sum by (${ctx.sumBy()}) (n1ql_request_timer_median{${ctx.jobSelector}}), "quantile", "p50", "", "")
                  or label_replace(sum by (${ctx.sumBy()}) (n1ql_request_timer_p95{${ctx.jobSelector}}),  "quantile", "p95", "", "")
                  or label_replace(sum by (${ctx.sumBy()}) (n1ql_request_timer_p99{${ctx.jobSelector}}),  "quantile", "p99", "", "")
                `.trim(),
                legendFormat: ctx.legend('quantile'),
                extraFields: ['d.labels.`instance`', 'd.labels.`quantile`'],
                unit: 'ns',
            }),
            ctx.panel('n1ql_request_timer_mean_max', 'Query Request Time — mean / max', {
                expr: `
                  label_replace(sum by (${ctx.sumBy()}) (n1ql_request_timer_mean{${ctx.jobSelector}}), "stat", "mean", "", "")
                  or label_replace(sum by (${ctx.sumBy()}) (n1ql_request_timer_max{${ctx.jobSelector}}),  "stat", "max",  "", "")
                `.trim(),
                legendFormat: ctx.legend('stat'),
                extraFields: ['d.labels.`instance`', 'd.labels.`stat`'],
                unit: 'ns',
            }),
        ]),
    ];
};

function simpleN1qlPanel(ctx: MetricContext, metric: string, title: string, unit: string, rate: boolean): SceneFlexItem {
    const inner = `${metric}{${ctx.jobSelector}${ctx.instanceFilter}}`;
    const series = rate ? `rate(${inner}[$__rate_interval])` : inner;
    return ctx.panel(metric, `${title}${ctx.titleSuffix}`, {
        expr: `sum by (${ctx.sumBy()}) (${series})`,
        legendFormat: ctx.legend(),
        unit,
    });
}

