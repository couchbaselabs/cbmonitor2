import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';

export function systemMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                // Per-service CPU and Memory utilisation
                // TODO: Add a logic to only show the panels for the services that are actually present in the snapshot.
                // Overall (per node) CPU and Memory utilisation
                createMetricPanel(snapshotId, 'sys_cpu_utilization_rate', 'CPU Utilization (%)', {
                    unit: 'percent'
                }),
                createMetricPanel(snapshotId, 'sys_mem_free_sys', 'Free Memory (Bytes)', {
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'sys_mem_used_sys', 'Used Memory (Bytes)', {
                    unit: 'bytes'
                }),
                // Overall Disk utilisation
                createMetricPanel(snapshotId, 'sys_disk_queue', 'Disk Queue (Aggregate)', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'sys_disk_read_bytes', 'Disk Read Bytes', {
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'sys_disk_write_bytes', 'Disk Write Bytes', {
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'couch_docs_actual_disk_size', 'Couch Docs Actual Disk Size (Bytes)', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`instance`'], 
                    unit: 'bytes'
                }),
            ],
        })
    });
}
