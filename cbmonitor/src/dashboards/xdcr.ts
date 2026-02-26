import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';

export function xdcrMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                createMetricPanel('sysproc_cpu_seconds_total', 'goxdcr CPU Time (Cumulative Seconds)', {
                    expr: `sum by (instance) (sysproc_cpu_seconds_total{job="${snapshotId}",proc="goxdcr"})`,
                    snapshotId,
                    labelFilters: { proc: 'goxdcr' },
                    unit: 's',
                }),
                createMetricPanel('sysproc_mem_resident', 'goxdcr Resident Memory (Bytes)', {
                    expr: `sum by (instance) (sysproc_mem_resident{job="${snapshotId}",proc="goxdcr"})`,
                    snapshotId,
                    labelFilters: { proc: 'goxdcr' },
                    unit: 'bytes',
                }),
                // XDCR Replication Progress Metrics
                createMetricPanel('xdcr_changes_left_total', 'Changes Left Total', {
                    expr: `sum by (instance) (xdcr_changes_left_total{job="${snapshotId}",pipelineType="Main"})`,
                    snapshotId,
                    labelFilters: { pipelineType: 'Main' },
                    unit: 'short'
                }),
                createMetricPanel('xdcr_docs_cloned_total', 'Documents Cloned Total', {
                    expr: `sum by (instance) (xdcr_docs_cloned_total{job="${snapshotId}",pipelineType="Main"})`,
                    snapshotId,
                    labelFilters: { pipelineType: 'Main' },
                    unit: 'short'
                }),
                createMetricPanel('xdcr_docs_checked_total', 'Documents Checked Total', {
                    expr: `sum by (instance) (xdcr_docs_checked_total{job="${snapshotId}",pipelineType="Main"})`,
                    snapshotId,
                    labelFilters: { pipelineType: 'Main' },
                    unit: 'short'
                }),
                createMetricPanel('xdcr_docs_written_total', 'Documents Written Total', {
                    expr: `sum by (instance) (xdcr_docs_written_total{job="${snapshotId}",pipelineType="Main"})`,
                    snapshotId,
                    labelFilters: { pipelineType: 'Main' },
                    unit: 'short'
                }),
                // XDCR Performance Metrics
                createMetricPanel('xdcr_wtavg_docs_latency_seconds', 'Weighted Average Document Latency (Seconds)', {
                    expr: `sum by (instance) (xdcr_wtavg_docs_latency_seconds{job="${snapshotId}",pipelineType="Main"})`,
                    snapshotId,
                    labelFilters: { pipelineType: 'Main' },
                    unit: 's'
                }),
                createMetricPanel('xdcr_wtavg_meta_latency_seconds', 'Weighted Average Metadata Latency (Seconds)', {
                    expr: `sum by (instance) (xdcr_wtavg_meta_latency_seconds{job="${snapshotId}",pipelineType="Main"})`,
                    snapshotId,
                    labelFilters: { pipelineType: 'Main' },
                    unit: 's'
                }),
                // XDCR Volume Metrics
                createMetricPanel('xdcr_data_replicated_bytes', 'Data Replicated (Bytes)', {
                    expr: `sum by (instance) (xdcr_data_replicated_bytes{job="${snapshotId}",pipelineType="Main"})`,
                    snapshotId,
                    labelFilters: { pipelineType: 'Main' },
                    unit: 'bytes'
                }),
            ],
        })
    });
}
