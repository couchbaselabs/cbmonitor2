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
                // XDCR Replication Progress Metrics
                createMetricPanel(snapshotId, 'xdcr_changes_left_total', 'Changes Left Total', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'xdcr_docs_cloned_total', 'Documents Cloned Total', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'xdcr_docs_checked_total', 'Documents Checked Total', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'xdcr_docs_written_total', 'Documents Written Total',{ 
                    unit: 'short'
                }),
                // XDCR Performance Metrics
                createMetricPanel(snapshotId, 'xdcr_wtavg_docs_latency_seconds', 'Weighted Average Document Latency (Seconds)', {
                    unit: 's'
                }),
                createMetricPanel(snapshotId, 'xdcr_wtavg_meta_latency_seconds', 'Weighted Average Metadata Latency (Seconds)', {
                    unit: 's'
                }),
                // XDCR Volume Metrics
                createMetricPanel(snapshotId, 'xdcr_data_replicated_bytes', 'Data Replicated (Bytes)', {
                    unit: 'bytes'
                }),
            ],
        })
    });
}
