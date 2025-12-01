import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';

export function analyticsMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                createMetricPanel(snapshotId, 'sysproc_cpu_seconds_total', 'Java CPU Time (Cumulative Seconds)', {
                    labelFilters: { proc: 'java' },
                    unit: 's'
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'Java Resident Memory (Bytes)', {
                    labelFilters: { proc: 'java' },
                    unit: 'bytes'
                }),
                 // Search (FTS)
                createMetricPanel(snapshotId, 'cbas_disk_used_bytes', 'Disk Used (Bytes)', {
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'cbas_direct_memory_used_bytes', 'Direct Memory Used (Bytes)', {
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'cbas_gc_count_total', 'Total GC Count', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'cbas_gc_time_seconds_total', 'GC Time (Seconds)', {
                    unit: 's'
                }),
                createMetricPanel(snapshotId, 'cbas_heap_memory_committed_bytes', 'Heap Memory Committed (Bytes)', {
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'cbas_heap_memory_used_bytes', 'Heap Memory Used (Bytes)', {
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'cbas_io_reads_total', 'Total IO Reads', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'cbas_io_writes_total', 'Total IO Writes', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'cbas_running_jobs', 'Running Jobs', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'cbas_queued_jobs', 'Queued Jobs', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'cbas_jobs_total', 'Total Jobs', {
                    extraFields: ['d.labels.`result`', 'd.labels.`instance`'],
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'cbas_system_load_average', 'System WorkLoad Average', {
                    unit: 'short'
                }),
                // Disk usage metrics
                createMetricPanel(snapshotId, 'cbas_requests_total', 'Total Received Requests', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'cbas_http_requests_total', 'HTTP Requests Total', {
                    unit: 'short'
                }),                
                // RAM usage metrics
                createMetricPanel(snapshotId, 'cbas_thread_count', 'Thread Count', {
                    unit: 'short'
                }),
            ],
        })
    });
}
