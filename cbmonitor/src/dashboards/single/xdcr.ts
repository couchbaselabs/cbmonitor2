import { EmbeddedScene } from '@grafana/scenes';
import { createMetricPanel, createFlexLayout } from 'utils/utils.panel';

export function xdcrMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: createFlexLayout({
            children: [
                createMetricPanel('sysproc_cpu_seconds_total', 'goxdcr CPU Usage (cores)', {
                    expr: `sum by (instance) (rate(sysproc_cpu_seconds_total{job="${snapshotId}",proc="goxdcr"}[$__rate_interval]))`,
                    snapshotId,
                    labelFilters: { proc: 'goxdcr' },
                    transformFunction: 'rate',
                    unit: 'short',
                }),
                createMetricPanel('sysproc_mem_resident', 'goxdcr Resident Memory (Bytes)', {
                    expr: `sum by (instance) (sysproc_mem_resident{job="${snapshotId}",proc="goxdcr"})`,
                    snapshotId,
                    labelFilters: { proc: 'goxdcr' },
                    unit: 'bytes',
                }),
                // XDCR Replication Progress Metrics
                // NOTE: gauge, not a counter — do not wrap in rate(). Tracks documents
                // currently pending replication, which goes up and down over time.
                createMetricPanel('xdcr_changes_left_total', 'Changes Left (Pending Docs)', {
                    expr: `sum by (instance) (xdcr_changes_left_total{job="${snapshotId}",pipelineType="Main"})`,
                    snapshotId,
                    labelFilters: { pipelineType: 'Main' },
                    unit: 'short'
                }),
                createMetricPanel('xdcr_docs_cloned_total', 'Documents Cloned/Sec', {
                    expr: `sum by (instance) (rate(xdcr_docs_cloned_total{job="${snapshotId}",pipelineType="Main"}[$__rate_interval]))`,
                    snapshotId,
                    labelFilters: { pipelineType: 'Main' },
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('xdcr_docs_checked_total', 'Documents Checked/Sec', {
                    expr: `sum by (instance) (rate(xdcr_docs_checked_total{job="${snapshotId}",pipelineType="Main"}[$__rate_interval]))`,
                    snapshotId,
                    labelFilters: { pipelineType: 'Main' },
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('xdcr_docs_written_total', 'Documents Written/Sec', {
                    expr: `sum by (instance) (rate(xdcr_docs_written_total{job="${snapshotId}",pipelineType="Main"}[$__rate_interval]))`,
                    snapshotId,
                    labelFilters: { pipelineType: 'Main' },
                    transformFunction: 'rate',
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
