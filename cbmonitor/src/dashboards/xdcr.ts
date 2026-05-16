import { EmbeddedScene } from '@grafana/scenes';
import {
    createInstanceAwareOverlapSceneFromBuilder,
    createInstanceAwareSceneFromBuilder,
} from 'utils/instanceScene';
import type { ServiceBuilder } from './types';

/**
 * Unified panel emitter for the XDCR (goxdcr) service. Nine aggregated
 * panels: two process panels filtered by `proc="goxdcr"`, then seven
 * pipeline-progress panels filtered by `pipelineType="Main"`. No
 * per-instance branch in either mode.
 */
export const xdcrBuilder: ServiceBuilder = (ctx) => {
    if (ctx.branch !== 'base') {
        return [];
    }
    return [
        ctx.panel('sysproc_cpu_seconds_total', `goxdcr CPU Usage (cores)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (rate(sysproc_cpu_seconds_total{${ctx.jobSelector},proc="goxdcr"${ctx.instanceFilter}}[$__rate_interval]))`,
            legendFormat: ctx.legend(),
            labelFilters: { proc: 'goxdcr' },
            transformFunction: 'rate',
            unit: 'short',
        }),
        ctx.panel('sysproc_mem_resident', `goxdcr Resident Memory (Bytes)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (sysproc_mem_resident{${ctx.jobSelector},proc="goxdcr"${ctx.instanceFilter}})`,
            legendFormat: ctx.legend(),
            labelFilters: { proc: 'goxdcr' },
            unit: 'bytes',
        }),
        // NOTE: gauge, not a counter — do not wrap in rate(). Tracks documents
        // currently pending replication, which goes up and down over time.
        ctx.panel('xdcr_changes_left_total', `Changes Left (Pending Docs)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (xdcr_changes_left_total{${ctx.jobSelector},pipelineType="Main"${ctx.instanceFilter}})`,
            legendFormat: ctx.legend(),
            labelFilters: { pipelineType: 'Main' },
            unit: 'short',
        }),
        ctx.panel('xdcr_docs_cloned_total', `Documents Cloned/Sec${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (rate(xdcr_docs_cloned_total{${ctx.jobSelector},pipelineType="Main"${ctx.instanceFilter}}[$__rate_interval]))`,
            legendFormat: ctx.legend(),
            labelFilters: { pipelineType: 'Main' },
            transformFunction: 'rate',
            unit: 'short',
        }),
        ctx.panel('xdcr_docs_checked_total', `Documents Checked/Sec${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (rate(xdcr_docs_checked_total{${ctx.jobSelector},pipelineType="Main"${ctx.instanceFilter}}[$__rate_interval]))`,
            legendFormat: ctx.legend(),
            labelFilters: { pipelineType: 'Main' },
            transformFunction: 'rate',
            unit: 'short',
        }),
        ctx.panel('xdcr_docs_written_total', `Documents Written/Sec${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (rate(xdcr_docs_written_total{${ctx.jobSelector},pipelineType="Main"${ctx.instanceFilter}}[$__rate_interval]))`,
            legendFormat: ctx.legend(),
            labelFilters: { pipelineType: 'Main' },
            transformFunction: 'rate',
            unit: 'short',
        }),
        ctx.panel('xdcr_wtavg_docs_latency_seconds', `Weighted Average Document Latency (Seconds)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (xdcr_wtavg_docs_latency_seconds{${ctx.jobSelector},pipelineType="Main"${ctx.instanceFilter}})`,
            legendFormat: ctx.legend(),
            labelFilters: { pipelineType: 'Main' },
            unit: 's',
        }),
        ctx.panel('xdcr_wtavg_meta_latency_seconds', `Weighted Average Metadata Latency (Seconds)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (xdcr_wtavg_meta_latency_seconds{${ctx.jobSelector},pipelineType="Main"${ctx.instanceFilter}})`,
            legendFormat: ctx.legend(),
            labelFilters: { pipelineType: 'Main' },
            unit: 's',
        }),
        ctx.panel('xdcr_data_replicated_bytes', `Data Replicated (Bytes)${ctx.titleSuffix}`, {
            expr: `sum by (${ctx.sumBy()}) (xdcr_data_replicated_bytes{${ctx.jobSelector},pipelineType="Main"${ctx.instanceFilter}})`,
            legendFormat: ctx.legend(),
            labelFilters: { pipelineType: 'Main' },
            unit: 'bytes',
        }),
    ];
};

export function xdcrMetricsDashboard(snapshotId: string): EmbeddedScene {
    return createInstanceAwareSceneFromBuilder(snapshotId, xdcrBuilder, {
        instanceMetric: 'xdcr_changes_left_total',
    });
}

export function xdcrOverlapMetricsDashboard(
    snapshotIds: string,
    overlapEndTimeSeconds?: number,
): EmbeddedScene {
    return createInstanceAwareOverlapSceneFromBuilder(snapshotIds, xdcrBuilder, {
        instanceMetric: 'xdcr_changes_left_total',
        overlapEndTimeSeconds,
    });
}
