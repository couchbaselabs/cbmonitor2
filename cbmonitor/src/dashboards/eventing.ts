import { EmbeddedScene } from '@grafana/scenes';
import {
    createInstanceAwareOverlapSceneFromBuilder,
    createInstanceAwareSceneFromBuilder,
} from 'utils/instanceScene';
import type { ServiceBuilder } from './types';

// TODO: Revisit this dashboard to make it more useful.

/**
 * Unified panel emitter for the Eventing service. Three aggregated panels:
 * eventing CPU, eventing resident memory, worker restart count. The single
 * dashboard has no per-instance branch; the overlap dashboard rebuilds
 * the same panel set once per instance group via the instance-aware driver.
 *
 * Note: routing single through `createInstanceAwareSceneFromBuilder` is a
 * small consistency upgrade over the prior bespoke `createFlexLayout` —
 * it adds layout-mode reactivity and the phase-regions data layer. No
 * change to PromQL or metric semantics.
 */
export const eventingBuilder: ServiceBuilder = (ctx) => {
    if (ctx.branch !== 'base') {
        // No per-instance or fallback panels in either mode for eventing.
        return [];
    }
    return [
        createCpuPanel(ctx),
        createMemPanel(ctx),
        createRestartCountPanel(ctx),
    ];
};

function createCpuPanel(ctx: Parameters<ServiceBuilder>[0]) {
    return ctx.panel('sysproc_cpu_seconds_total', `Eventing CPU Usage (cores)${ctx.titleSuffix}`, {
        expr: `sum by (${ctx.sumBy()}) (rate(sysproc_cpu_seconds_total{${ctx.jobSelector},proc="eventing-produc"${ctx.instanceFilter}}[$__rate_interval]))`,
        legendFormat: ctx.legend(),
        labelFilters: { proc: 'eventing-produc' },
        extraFields: ['d.labels.`instance`', 'd.labels.`mode`'],
        transformFunction: 'rate',
        unit: 'short',
    });
}

function createMemPanel(ctx: Parameters<ServiceBuilder>[0]) {
    return ctx.panel('sysproc_mem_resident', `Eventing Resident Memory (Bytes)${ctx.titleSuffix}`, {
        expr: `sum by (${ctx.sumBy()}) (sysproc_mem_resident{${ctx.jobSelector},proc="eventing-produc"${ctx.instanceFilter}})`,
        legendFormat: ctx.legend(),
        labelFilters: { proc: 'eventing-produc' },
        unit: 'bytes',
    });
}

function createRestartCountPanel(ctx: Parameters<ServiceBuilder>[0]) {
    return ctx.panel('eventing_worker_restart_count', `Worker Restart Count${ctx.titleSuffix}`, {
        expr: `sum by (${ctx.sumBy()}) (eventing_worker_restart_count{${ctx.jobSelector}${ctx.instanceFilter}})`,
        legendFormat: ctx.legend(),
        extraFields: ['d.labels.instance'],
        width: '100%',
        unit: 'short',
    });
}

export function eventingMetricsDashboard(snapshotId: string): EmbeddedScene {
    return createInstanceAwareSceneFromBuilder(snapshotId, eventingBuilder, {
        instanceMetric: 'eventing_worker_restart_count',
    });
}

export function eventingOverlapMetricsDashboard(
    snapshotIds: string,
    overlapEndTimeSeconds?: number,
): EmbeddedScene {
    return createInstanceAwareOverlapSceneFromBuilder(snapshotIds, eventingBuilder, {
        instanceMetric: 'eventing_worker_restart_count',
        overlapEndTimeSeconds,
    });
}
