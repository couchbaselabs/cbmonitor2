import { EmbeddedScene } from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';
import { createInstanceAwareScene } from 'utils/instanceScene';

export function kvMetricsDashboard(snapshotId: string): EmbeddedScene {
    const buildBaseChildren = () => [
        // memcached
        createMetricPanel('sysproc_cpu_seconds_total', 'memcached CPU Usage (cores)', {
            expr: `sum by (instance) (rate(sysproc_cpu_seconds_total{job="${snapshotId}",proc="memcached"}[$__rate_interval]))`,
            snapshotId,
            labelFilters: { proc: 'memcached' },
            transformFunction: 'rate',
            unit: 'short',
        }),
        createMetricPanel('sysproc_mem_resident', 'memcached Resident Memory (Bytes)', {
            expr: `sum by (instance) (sysproc_mem_resident{job="${snapshotId}",proc="memcached"})`,
            snapshotId,
            labelFilters: { proc: 'memcached' },
            unit: 'bytes',
        }),

        // Operations & Performance (rate of GET ops aggregated by instance + bucket)
        createMetricPanel('kv_vb_ops_get', 'vBucket GET Ops/Sec', {
            expr: `sum by (instance, bucket) (rate(kv_vb_ops_get{job="${snapshotId}"}[$__rate_interval]))`,
            legendFormat: '{{instance}} , {{bucket}}',
            snapshotId,
            transformFunction: 'rate',
            extraFields: ['d.labels.`instance`', 'd.labels.`bucket`'],
            unit: 'short',
        }),

        // Workload mix: ops/sec broken out by operation type across all
        // buckets/instances. Answers "is this workload read-heavy or write-heavy?" at a glance.
        createMetricPanel('kv_ops_by_type', 'KV Operations by Type (ops/sec)', {
            expr: `sum by (op) (rate(kv_ops{job="${snapshotId}"}[$__rate_interval]))`,
            legendFormat: '{{op}}',
            snapshotId,
            transformFunction: 'rate',
            extraFields: ['d.labels.`op`'],
            unit: 'short',
        }),

        // Data & Items (what we're storing)
        createMetricPanel('kv_curr_items', 'Current Items Count', {
            expr: `sum by (instance) (kv_curr_items{job="${snapshotId}"})`,
            snapshotId,
            unit: 'short',
        }),
        createMetricPanel('kv_curr_connections', 'Current Connections Count', {
            expr: `sum by (instance) (kv_curr_connections{job="${snapshotId}"})`,
            snapshotId,
            unit: 'short',
        }),

        // Memory Usage (resource consumption)
        createMetricPanel('kv_mem_used_bytes', 'KV Memory Usage (Bytes)', {
            expr: `sum by (instance) (kv_mem_used_bytes{job="${snapshotId}"})`,
            snapshotId,
            unit: 'bytes',
        }),
        createMetricPanel('kv_ep_meta_data_memory_bytes', 'Metadata Memory Usage (Bytes)', {
            expr: `sum by (instance) (kv_ep_meta_data_memory_bytes{job="${snapshotId}"})`,
            snapshotId,
            unit: 'bytes',
        }),

        // Disk Queue Metrics (persistence layer)
        createMetricPanel('kv_ep_diskqueue_fill', 'KV Engine Disk Queue Fill', {
            expr: `sum by (instance) (kv_ep_diskqueue_fill{job="${snapshotId}"})`,
            snapshotId,
            unit: 'short',
        }),
        createMetricPanel('kv_ep_diskqueue_drain', 'KV Engine Disk Queue Drain', {
            expr: `sum by (instance) (kv_ep_diskqueue_drain{job="${snapshotId}"})`,
            snapshotId,
            unit: 'short',
        }),

        // Queue Metrics (internal processing)
        createMetricPanel('kv_ep_queue_size', 'KV Engine Queue Size', {
            expr: `sum by (instance) (kv_ep_queue_size{job="${snapshotId}"})`,
            snapshotId,
            unit: 'short',
        }),
        createMetricPanel('kv_vb_queue_size', 'vBucket Queue Size', {
            expr: `sum by (instance) (kv_vb_queue_size{job="${snapshotId}"})`,
            snapshotId,
            unit: 'short',
        }),
        createMetricPanel('kv_vb_queue_age_seconds', 'vBucket Queue Age (Seconds)', {
            expr: `sum by (instance) (kv_vb_queue_age_seconds{job="${snapshotId}"})`,
            snapshotId,
            unit: 's',
        }),
        createMetricPanel('kv_dcp_items_sent', 'DCP Items Sent (Items/Sec)', {
            expr: `rate(kv_dcp_items_sent{job="${snapshotId}"}[$__rate_interval])`,
            legendFormat: '{{instance}} , {{bucket}} , {{connection_type}}',
            snapshotId,
            transformFunction: 'rate',
            extraFields: ['d.labels.`instance`', 'd.labels.`bucket`', 'd.labels.`connection_type`'],
            unit: 'short',
        }),
        createMetricPanel('kv_dcp_connection_count', 'Current DCP Connection Count', {
            expr: `kv_dcp_connection_count{job="${snapshotId}"}`,
            legendFormat: '{{instance}} , {{bucket}} , {{connection_type}}',
            snapshotId,
            extraFields: ['d.labels.`instance`', 'd.labels.`bucket`', 'd.labels.`connection_type`'],
            unit: 'short',
        }),
        createMetricPanel('kv_dcp_backoff', 'DCP Backoff', {
            expr: `kv_dcp_backoff{job="${snapshotId}"}`,
            legendFormat: '{{instance}} , {{bucket}} , {{connection_type}}',
            snapshotId,
            extraFields: ['d.labels.`instance`', 'd.labels.`bucket`', 'd.labels.`connection_type`'],
            unit: 'short',
        }),
        createMetricPanel('kv_dcp_items_remaining', 'DCP Items Remaining', {
            expr: `kv_dcp_items_remaining{job="${snapshotId}"}`,
            legendFormat: '{{instance}} , {{bucket}} , {{connection_type}}',
            snapshotId,
            extraFields: ['d.labels.`instance`', 'd.labels.`bucket`', 'd.labels.`connection_type`'],
            unit: 'short',
        }),
    ];

    return createInstanceAwareScene(
        snapshotId,
        'kv_ops',
        buildBaseChildren,
        (i: string) => [
            createMetricPanel('kv_ops', `KV Operations/Sec (${i})`, {
                expr: `rate(kv_ops{job="${snapshotId}",instance="${i}"}[$__rate_interval])`,
                legendFormat: '{{bucket}} , {{op}} , {{result}}',
                snapshotId,
                labelFilters: { instance: i },
                extraFields: ['d.labels.`bucket`', 'd.labels.`op`', 'd.labels.`result`'],
                transformFunction: 'rate',
                unit: 'short',
            }),
        ],
        () => [
            createMetricPanel('kv_ops', 'KV Operations/Sec', {
                expr: `rate(kv_ops{job="${snapshotId}"}[$__rate_interval])`,
                legendFormat: '{{instance}} , {{bucket}} , {{op}} , {{result}}',
                snapshotId,
                extraFields: ['d.labels.`instance`','d.labels.`bucket`', 'd.labels.`op`', 'd.labels.`result`'],
                transformFunction: 'rate',
                unit: 'short',
            }),
        ]
    );
}
