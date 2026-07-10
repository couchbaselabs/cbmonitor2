import type { ServiceBuilder } from './types';

// TODO: Revisit this dashboard to make it more useful.

/**
 * Unified panel emitter for the Cluster Manager service. Four aggregated
 * base panels (ns_server CPU/mem, Prometheus CPU/mem) plus one
 * HTTP-requests panel that lives in different branches per mode:
 * - Single: a full-width per-instance breakdown by HTTP `method`, with
 *   an aggregated fallback when no instances are discovered.
 * - Overlap: a single full-width panel rendered per instance group with
 *   `sum by (job[, instance], method)`.
 */
export const clusterManagerBuilder: ServiceBuilder = (ctx) => {
    if (ctx.branch === 'base') {
        return [
            ctx.panel('sysproc_cpu_seconds_total', `ns_server CPU Usage (cores)${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy()}) (rate(sysproc_cpu_seconds_total{${ctx.jobSelector},proc="ns_server"${ctx.instanceFilter}}[$__rate_interval]))`,
                legendFormat: ctx.legend(),
                labelFilters: { proc: 'ns_server' },
                transformFunction: 'rate',
                unit: 'short',
            }),
            ctx.panel('sysproc_mem_resident', `ns_server Resident Memory (Bytes)${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy()}) (sysproc_mem_resident{${ctx.jobSelector},proc="ns_server"${ctx.instanceFilter}})`,
                legendFormat: ctx.legend(),
                labelFilters: { proc: 'ns_server' },
                unit: 'bytes',
            }),
            ctx.panel('sysproc_cpu_seconds_total', `Prometheus CPU Usage (cores)${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy()}) (rate(sysproc_cpu_seconds_total{${ctx.jobSelector},proc="prometheus"${ctx.instanceFilter}}[$__rate_interval]))`,
                legendFormat: ctx.legend(),
                labelFilters: { proc: 'prometheus' },
                transformFunction: 'rate',
                unit: 'short',
            }),
            ctx.panel('sysproc_mem_resident', `Prometheus Resident Memory (Bytes)${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy()}) (sysproc_mem_resident{${ctx.jobSelector},proc="prometheus"${ctx.instanceFilter}})`,
                legendFormat: ctx.legend(),
                labelFilters: { proc: 'prometheus' },
                unit: 'bytes',
            }),
            // HTTP requests aggregated in overlap base; single mode emits
            // a per-instance method breakdown (and a stripped fallback)
            // in the branches below.
            ...ctx.modeOnly(['overlap'], [
                ctx.panel('cm_http_requests_total', `HTTP Requests/Sec${ctx.titleSuffix}`, {
                    expr: `sum by (${ctx.sumBy('method')}) (rate(cm_http_requests_total{${ctx.jobSelector}${ctx.instanceFilter}}[$__rate_interval]))`,
                    legendFormat: ctx.legend('method'),
                    unit: 'short',
                    width: '100%',
                }),
            ]),
        ];
    }

    if (ctx.branch === 'perInstance') {
        const i = ctx.perInstance!;
        return [
            ctx.panel('cm_http_requests_total', `HTTP Requests/Sec (${i})`, {
                expr: `sum by (method) (rate(cm_http_requests_total{${ctx.jobSelector},instance="${i}"}[$__rate_interval]))`,
                legendFormat: '{{method}}',
                labelFilters: { instance: i },
                extraFields: ['d.labels.method'],
                transformFunction: 'rate',
                unit: 'short',
            }),
        ];
    }

    // branch === 'fallback' (single mode only — no instances discovered).
    return [
        ctx.panel('cm_http_requests_total', 'HTTP Requests/Sec', {
            expr: `rate(cm_http_requests_total{${ctx.jobSelector}}[$__rate_interval])`,
            legendFormat: '{{method}} , {{instance}}',
            extraFields: ['d.labels.method', 'd.labels.instance'],
            transformFunction: 'rate',
            unit: 'short',
        }),
    ];
};

