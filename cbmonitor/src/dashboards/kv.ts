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
                // memcached
                createMetricPanel(snapshotId, 'sysproc_cpu_utilization', 'memcached CPU Utilization (%)', {
                    labelFilters: { proc: 'memcached' },
                    unit: 'percent'
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'memcached Resident Memory (Bytes)', {
                    labelFilters: { proc: 'memcached' },
                    unit: 'bytes'
                }),
                // Operations & Performance (most important high-level metrics first)
                createMetricPanel(snapshotId, 'kv_ops', 'KV Operations (ops)', {
                    extraFields: ['d.labels.`instance`' ,'d.labels.`op`', 'd.labels.`result`','d.labels.`bucket`'],
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'kv_vb_ops_get', 'vBucket GET Ops', {
                    extraFields: ['d.labels.`instance`' ,'d.labels.`op`', 'd.labels.`result`','d.labels.`bucket`'],
                    unit: 'short' 
                }),
                // Data & Items (what we're storing)
                createMetricPanel(snapshotId, 'kv_curr_items', 'Current Items Count', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'kv_curr_connections', 'Current Connections Count', {
                    unit: 'short'
                }),
                
                // Memory Usage (resource consumption)
                createMetricPanel(snapshotId, 'kv_mem_used_bytes', 'KV Memory Usage (Bytes)', {
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'kv_ep_meta_data_memory_bytes', 'Metadata Memory Usage (Bytes)', {
                    unit: 'bytes'
                }),

                // Disk Queue Metrics (persistence layer)
                createMetricPanel(snapshotId, 'kv_ep_diskqueue_fill', 'KV Engine Disk Queue Fill', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'kv_ep_diskqueue_drain', 'KV Engine Disk Queue Drain', {
                    unit: 'short'
                }),
                
                // Queue Metrics (internal processing)
                createMetricPanel(snapshotId, 'kv_ep_queue_size', 'KV Engine Queue Size', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'kv_vb_queue_size', 'vBucket Queue Size', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'kv_vb_queue_age_seconds', 'vBucket Queue Age (Seconds)', {
                    unit: 's'
                }), 
            ],
        })
    });
}
