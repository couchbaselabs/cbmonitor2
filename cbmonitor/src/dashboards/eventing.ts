import type { ServiceBuilder } from './types';

// TODO: Revisit this dashboard to make it more useful.

/**
 * Unified panel emitter for the Eventing service. Three aggregated panels:
 * eventing CPU, eventing resident memory, worker restart count. No
 * per-instance branch in either mode — both modes emit the same three
 * panels through the `base` branch.
 */
export const eventingBuilder: ServiceBuilder = (ctx) => {
    if (ctx.branch !== 'base') {
        return [];
    }
    return [
        ctx.panel('sysproc_cpu_seconds_total', `Eventing CPU Usage (cores)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (rate(sysproc_cpu_seconds_total{${ctx.jobSelector},proc="eventing-produc"${ctx.instanceFilter}}[$__rate_interval]))`,
            legendFormat: ctx.legend(),
            unit: 'short',
        }),
        ctx.panel('sysproc_mem_resident', `Eventing Resident Memory (Bytes)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (sysproc_mem_resident{${ctx.jobSelector},proc="eventing-produc"${ctx.instanceFilter}})`,
            legendFormat: ctx.legend(),
            unit: 'bytes',
        }),
        ctx.panel('eventing_worker_restart_count', `Worker Restart Count${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (eventing_worker_restart_count{${ctx.jobSelector}${ctx.instanceFilter}})`,
            legendFormat: ctx.legend(),
            unit: 'short',
        }),
    ];
};
