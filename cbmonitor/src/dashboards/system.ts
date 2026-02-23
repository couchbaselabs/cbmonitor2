import { EmbeddedScene } from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';
import { createInstanceAwareScene } from 'utils/instanceScene';

export function systemMetricsDashboard(snapshotId: string): EmbeddedScene {
    const buildBaseChildren = () => [
        // Per-service CPU and Memory utilisation
        // TODO: Add a logic to only show the panels for the services that are actually present in the snapshot.
        // Overall (per node) CPU and Memory utilisation
        createMetricPanel('sys_cpu_utilization_rate', 'CPU Utilization (%)', {
            expr: `sys_cpu_utilization_rate{job="${snapshotId}"}`,
            snapshotId,
            unit: 'percent',
            width: '100%'
        }),
        createMetricPanel('sys_mem_free_sys', 'Free Memory (Bytes)', {
            expr: `sys_mem_free_sys{job="${snapshotId}"}`,
            snapshotId,
            unit: 'bytes',
        }),
        createMetricPanel('sys_mem_used_sys', 'Used Memory (Bytes)', {
            expr: `sys_mem_used_sys{job="${snapshotId}"}`,
            snapshotId,
            unit: 'bytes',
        }),
        // Overall Disk utilisation
        createMetricPanel('sys_disk_queue', 'Disk Queue (Aggregate)', {
            expr: `sum by (instance) (sys_disk_queue{job="${snapshotId}"})`,
            snapshotId,
            unit: 'short',
        }),
        createMetricPanel('couch_docs_actual_disk_size', 'Couch Docs Actual Disk Size (Bytes)', {
            expr: `couch_docs_actual_disk_size{job="${snapshotId}"}`,
            legendFormat: '{{instance}} , {{bucket}}',
            snapshotId,
            extraFields: ['d.labels.`instance`', 'd.labels.`bucket`'],
            unit: 'bytes',
        }),
    ];

    return createInstanceAwareScene(
        snapshotId,
        'sys_disk_read_bytes',
        buildBaseChildren,
        (i: string) => [
            createMetricPanel('sys_disk_read_bytes', `Rate Disk Read Bytes (${i})`, {
                expr: `rate(sys_disk_read_bytes{job="${snapshotId}",instance="${i}"}[$__rate_interval])`,
                legendFormat: '{{disk}}',
                snapshotId,
                labelFilters: { instance: i },
                extraFields: ['d.labels.`disk`'],
                transformFunction: 'rate',
                unit: 'Bps',
            }),
            createMetricPanel('sys_disk_write_bytes', `Rate Disk Write Bytes (${i})`, {
                expr: `rate(sys_disk_write_bytes{job="${snapshotId}",instance="${i}"}[$__rate_interval])`,
                legendFormat: '{{disk}}',
                snapshotId,
                labelFilters: { instance: i },
                extraFields: ['d.labels.`disk`'],
                transformFunction: 'rate',
                unit: 'Bps',
            }),
        ],
        () => [
            createMetricPanel('sys_disk_read_bytes', 'Rate Disk Read Bytes', {
                expr: `rate(sys_disk_read_bytes{job="${snapshotId}"}[$__rate_interval])`,
                legendFormat: '{{disk}}',
                snapshotId,
                extraFields: ['d.labels.`disk`'],
                transformFunction: 'rate',
                unit: 'Bps',
            }),
            createMetricPanel('sys_disk_write_bytes', 'Rate Disk Write Bytes', {
                expr: `rate(sys_disk_write_bytes{job="${snapshotId}"}[$__rate_interval])`,
                legendFormat: '{{disk}}',
                snapshotId,
                extraFields: ['d.labels.`disk`'],
                transformFunction: 'rate',
                unit: 'Bps',
            }),
        ]
    );
}
