import { EmbeddedScene } from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';
import { createInstanceAwareScene } from 'utils/instanceScene';

export function kvMetricsDashboard(snapshotId: string): EmbeddedScene {
    const buildBaseChildren = () => [
        // memcached
        createMetricPanel(snapshotId, 'sysproc_cpu_seconds_total', 'memcached CPU Time (Cumulative Seconds)', {
            labelFilters: { proc: 'memcached' },
            unit: 's',
        }),
        createMetricPanel(snapshotId, 'sysproc_mem_resident', 'memcached Resident Memory (Bytes)', {
            labelFilters: { proc: 'memcached' },
            unit: 'bytes',
        }),

        // Operations & Performance (keep GET ops aggregated for now)
        createMetricPanel(snapshotId, 'kv_vb_ops_get', 'vBucket GET Ops', {
            extraFields: ['d.labels.`instance`', 'd.labels.`bucket`'],
            unit: 'short',
        }),

        // Data & Items (what we're storing)
        createMetricPanel(snapshotId, 'kv_curr_items', 'Current Items Count', {
            unit: 'short',
        }),
        createMetricPanel(snapshotId, 'kv_curr_connections', 'Current Connections Count', {
            unit: 'short',
        }),

        // Memory Usage (resource consumption)
        createMetricPanel(snapshotId, 'kv_mem_used_bytes', 'KV Memory Usage (Bytes)', {
            unit: 'bytes',
        }),
        createMetricPanel(snapshotId, 'kv_ep_meta_data_memory_bytes', 'Metadata Memory Usage (Bytes)', {
            unit: 'bytes',
        }),

        // Disk Queue Metrics (persistence layer)
        createMetricPanel(snapshotId, 'kv_ep_diskqueue_fill', 'KV Engine Disk Queue Fill', {
            unit: 'short',
        }),
        createMetricPanel(snapshotId, 'kv_ep_diskqueue_drain', 'KV Engine Disk Queue Drain', {
            unit: 'short',
        }),

        // Queue Metrics (internal processing)
        createMetricPanel(snapshotId, 'kv_ep_queue_size', 'KV Engine Queue Size', {
            unit: 'short',
        }),
        createMetricPanel(snapshotId, 'kv_vb_queue_size', 'vBucket Queue Size', {
            unit: 'short',
        }),
        createMetricPanel(snapshotId, 'kv_vb_queue_age_seconds', 'vBucket Queue Age (Seconds)', {
            unit: 's',
        }),
    ];

    return createInstanceAwareScene(
        snapshotId,
        'kv_ops',
        buildBaseChildren,
        (i: string) => [
            createMetricPanel(snapshotId, 'kv_ops', `KV Operations (ops) (${i})`, {
                labelFilters: { instance: i },
                extraFields: ['d.labels.`bucket`', 'd.labels.`op`', 'd.labels.`result`'],
                unit: 'short',
            }),
        ],
        () => [
            createMetricPanel(snapshotId, 'kv_ops', 'KV Operations (ops)', {
                extraFields: ['d.labels.`instance`','d.labels.`bucket`', 'd.labels.`op`', 'd.labels.`result`'],
                unit: 'short',
            }),
        ]
    );
}
