import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { getSnapshotPanel } from 'utils/utils.panel';

export function kvMetricsDashboard(snapshotId: string): EmbeddedScene {
    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                getSnapshotPanel(snapshotId, 'kv_mem_used_bytes', 'KV Memory Usage (Bytes)'),
                getSnapshotPanel(snapshotId, 'kv_ep_meta_data_memory_bytes', 'Metadata Memory Usage (Bytes)'),
                getSnapshotPanel(snapshotId, 'couch_docs_actual_disk_size', 'Couch Docs Actual Disk Size (Bytes)'),
                getSnapshotPanel(snapshotId, 'kv_ep_queue_size', 'KV Engine Queue Size'),
                getSnapshotPanel(snapshotId, 'kv_ops', 'KV Operations (ops)'),
                getSnapshotPanel(snapshotId, 'kv_ep_diskqueue_fill', 'KV Engine Disk Queue Fill'),
                getSnapshotPanel(snapshotId, 'kv_ep_diskqueue_drain', 'KV Engine Disk Queue Drain'),
                getSnapshotPanel(snapshotId, 'kv_vb_ops_get', 'vBucket GET Ops'),
                getSnapshotPanel(snapshotId, 'kv_curr_items', 'Current Items Count'),
                getSnapshotPanel(snapshotId, 'kv_vb_queue_age_seconds', 'vBucket Queue Age (Seconds)'),
                getSnapshotPanel(snapshotId, 'kv_vb_queue_size', 'vBucket Queue Size (Bytes)'),
            ],
        })
    });
}
