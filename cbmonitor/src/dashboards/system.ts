import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { getSnapshotPanel } from 'utils/utils.panel';

export function systemMetricsDashboard(snapshotId: string): EmbeddedScene {
    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                getSnapshotPanel(snapshotId, 'sys_cpu_utilization_rate', 'CPU Utilization (%)'),
                getSnapshotPanel(snapshotId, 'sys_mem_free', 'Free Memory (Bytes)'),
                getSnapshotPanel(snapshotId, 'sys_cpu_cores_available', 'CPU Cores Available'),
                getSnapshotPanel(snapshotId, 'sys_disk_queue', 'Disk Queue (Aggregate)'),
                getSnapshotPanel(snapshotId, 'couch_docs_actual_disk_size', 'Couch Docs Actual Disk Size (Bytes)', 'd.labels.`bucket`'),
                getSnapshotPanel(snapshotId, 'scrape_duration_seconds', 'Scrape Duration (s)'),
                getSnapshotPanel(snapshotId, 'sysproc_cpu_utilization', 'memcached CPU Utilization (%)', 'd.labels.instance', 'memcached'),
                getSnapshotPanel(snapshotId, 'sysproc_mem_resident', 'memcached Resident Memory (Bytes)', 'd.labels.instance', 'memcached'),
                getSnapshotPanel(snapshotId, 'sysproc_cpu_utilization', 'ns_server CPU Utilization (%)', 'd.labels.instance', 'ns_server'),
                getSnapshotPanel(snapshotId, 'sysproc_mem_resident', 'ns_server Resident Memory (Bytes)', 'd.labels.instance', 'ns_server'),
                getSnapshotPanel(snapshotId, 'sysproc_cpu_utilization', 'Indexer CPU Utilization (%)', 'd.labels.instance', 'indexer'),
                getSnapshotPanel(snapshotId, 'sysproc_mem_resident', 'Indexer Resident Memory (Bytes)', 'd.labels.instance', 'indexer'),
                getSnapshotPanel(snapshotId, 'sysproc_cpu_utilization', 'Query Engine CPU Utilization (%)', 'd.labels.instance', 'cbq-engine'),
                getSnapshotPanel(snapshotId, 'sysproc_mem_resident', 'Query Engine Resident Memory (Bytes)', 'd.labels.instance', 'cbq-engine'),
                getSnapshotPanel(snapshotId, 'kv_ep_meta_data_memory_bytes', 'KV EP Metadata Memory (Bytes)'),
                getSnapshotPanel(snapshotId, 'kv_ep_queue_size', 'KV EP Queue Size (Bytes)'),
                getSnapshotPanel(snapshotId, 'kv_ep_diskqueue_fill', 'KV EP Disk Queue Fill (Bytes)'),
                getSnapshotPanel(snapshotId, 'kv_ep_diskqueue_drain', 'KV EP Disk Queue Drain (Bytes)'),
                getSnapshotPanel(snapshotId, 'kv_vb_queue_age_seconds', 'vBucket Queue Age (Seconds)'),
                getSnapshotPanel(snapshotId, 'kv_vb_queue_size', 'vBucket Queue Size (Bytes)')
            ],
        })
    });
}
