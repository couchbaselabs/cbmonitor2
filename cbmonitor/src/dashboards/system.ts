import { EmbeddedScene } from '@grafana/scenes';
import { createMetricPanel, createAggregatedMetricPanel } from 'utils/utils.panel';
import { createInstanceAwareScene } from 'utils/instanceScene';

export function systemMetricsDashboard(snapshotId: string): EmbeddedScene {
    const buildBaseChildren = () => [
        // Per-service CPU and Memory utilisation
        // TODO: Add a logic to only show the panels for the services that are actually present in the snapshot.
        // Overall (per node) CPU and Memory utilisation
        createMetricPanel(snapshotId, 'sys_cpu_utilization_rate', 'CPU Utilization (%)', {
            unit: 'percent',
            width: '100%'
        }),
        createMetricPanel(snapshotId, 'sys_mem_free_sys', 'Free Memory (Bytes)', {
            unit: 'bytes',
        }),
        createMetricPanel(snapshotId, 'sys_mem_used_sys', 'Used Memory (Bytes)', {
            unit: 'bytes',
        }),
        // Overall Disk utilisation
        createMetricPanel(snapshotId, 'sys_disk_queue', 'Disk Queue (Aggregate)', {
            unit: 'short',
        }),
        createMetricPanel(snapshotId, 'couch_docs_actual_disk_size', 'Couch Docs Actual Disk Size (Bytes)', {
            extraFields: ['d.labels.`instance`', 'd.labels.`bucket`'],
            unit: 'bytes',
        }),
    ];

    return createInstanceAwareScene(
        snapshotId,
        'sys_disk_read_bytes',
        buildBaseChildren,
        (i: string) => [
            createAggregatedMetricPanel(snapshotId, 'sys_disk_read_bytes', `Rate Disk Read Bytes (${i})`, {
                labelFilters: { instance: i },
                extraFields: ['d.labels.`disk`'],
                unit: 'Bps',
                transformFunction: 'rate',
            }),
            createAggregatedMetricPanel(snapshotId, 'sys_disk_write_bytes', `Rate Disk Write Bytes (${i})`, {
                labelFilters: { instance: i },
                extraFields: ['d.labels.`disk`'],
                unit: 'Bps',
                transformFunction: 'rate',
            }),
        ],
        () => [
            createAggregatedMetricPanel(snapshotId, 'sys_disk_read_bytes', 'Rate Disk Read Bytes', {
                extraFields: ['d.labels.`disk`'],
                unit: 'Bps',
                transformFunction: 'rate',
            }),
            createAggregatedMetricPanel(snapshotId, 'sys_disk_write_bytes', 'Rate Disk Write Bytes', {
                extraFields: ['d.labels.`disk`'],
                unit: 'Bps',
                transformFunction: 'rate',
            }),
        ]
    );
}
