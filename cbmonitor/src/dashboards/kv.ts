import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';

export function kvMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                createMetricPanel(snapshotId, 'kv_mem_used_bytes', 'KV Memory Usage (Bytes)'),
                createMetricPanel(snapshotId, 'kv_ep_meta_data_memory_bytes', 'Metadata Memory Usage (Bytes)'),
                createMetricPanel(snapshotId, 'couch_docs_actual_disk_size', 'Couch Docs Actual Disk Size (Bytes)'),
                createMetricPanel(snapshotId, 'kv_ep_queue_size', 'KV Engine Queue Size'),
                createMetricPanel(snapshotId, 'kv_ops', 'KV Operations (ops)'),
                createMetricPanel(snapshotId, 'kv_ep_diskqueue_fill', 'KV Engine Disk Queue Fill'),
                createMetricPanel(snapshotId, 'kv_ep_diskqueue_drain', 'KV Engine Disk Queue Drain'),
                createMetricPanel(snapshotId, 'kv_vb_ops_get', 'vBucket GET Ops'),
                createMetricPanel(snapshotId, 'kv_curr_items', 'Current Items Count'),
                createMetricPanel(snapshotId, 'kv_vb_queue_age_seconds', 'vBucket Queue Age (Seconds)'),
                createMetricPanel(snapshotId, 'kv_vb_queue_size', 'vBucket Queue Size (Bytes)'),
            ],
        })
    });
}
