import { EmbeddedScene, SceneFlexLayout } from '@grafana/scenes';
import { createOverlapMetricPanel } from '../../utils/utils.overlapQueries';

/**
 * System metrics overlap dashboard for comparing multiple snapshots.
 * Displays system metrics with job (snapshot ID) as the differentiator.
 * All panels use sum by (job, instance) with legend: A - {{instance}}, B - {{instance}}, etc.
 */
export function systemMetricsOverlapDashboard(snapshotIds: string[]): EmbeddedScene {
    const children = [
        // Overall (per node) CPU and Memory utilisation
        createOverlapMetricPanel('sys_cpu_utilization_rate', 'CPU Utilization (%)', {
            expr: 'sys_cpu_utilization_rate{job"${snapshotIds}"}',
            snapshotIds,
            unit: 'percent',
            width: '100%',
        }),
        createOverlapMetricPanel('sys_mem_free_sys', 'Free Memory (Bytes)', {
            expr: 'sys_mem_free_sys{job"${snapshotIds}"}',
            snapshotIds,
            unit: 'bytes',
        }),
        createOverlapMetricPanel('sys_mem_used_sys', 'Used Memory (Bytes)', {
            expr: 'sys_mem_used_sys{job"${snapshotIds}"}',
            snapshotIds,
            unit: 'bytes',
        }),
        // Overall Disk utilisation
        createOverlapMetricPanel('sys_disk_queue', 'Disk Queue (Aggregate)', {
            expr: 'sys_disk_queue{job"${snapshotIds}"}',
            snapshotIds,
            unit: 'short',
        }),
        createOverlapMetricPanel('couch_docs_actual_disk_size', 'Couch Docs Actual Disk Size (Bytes)', {
            expr: 'couch_docs_actual_disk_size{job"${snapshotIds}"}',
            snapshotIds,
            extraGroupBy: ['bucket'],
            legendSuffix: ' , {{bucket}}',
            unit: 'bytes',
        }),
        // Disk read/write rates
        createOverlapMetricPanel('sys_disk_read_bytes', 'Rate Disk Read Bytes', {
            expr: 'sum by (job, instance, disk) (rate(sys_disk_read_bytes{job"${snapshotIds}"}[$__rate_interval]))',
            snapshotIds,
            legendSuffix: ' - {{disk}}',
            unit: 'Bps',
        }),
        createOverlapMetricPanel('sys_disk_write_bytes', 'Rate Disk Write Bytes', {
            expr: 'sum by (job, instance, disk) (rate(sys_disk_write_bytes{job"${snapshotIds}"}[$__rate_interval]))',
            snapshotIds,
            legendSuffix: ' - {{disk}}',
            unit: 'Bps',
        }),
    ];

    return new EmbeddedScene({
        body: new SceneFlexLayout({
            wrap: 'wrap',
            direction: 'row',
            children,
        }),
    });
}
