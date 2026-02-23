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
                createMetricPanel('sysproc_cpu_seconds_total', 'Java CPU Time (Cumulative Seconds)', {
                    expr: `sysproc_cpu_seconds_total{job="${snapshotId}",proc="java"}`,
                    snapshotId,
                    labelFilters: { proc: 'java' },
                    unit: 's'
                }),
                createMetricPanel('sysproc_mem_resident', 'Java Resident Memory (Bytes)', {
                    expr: `sysproc_mem_resident{job="${snapshotId}",proc="java"}`,
                    snapshotId,
                    labelFilters: { proc: 'java' },
                    unit: 'bytes'
                }),
                 // Search (FTS)
                createMetricPanel('cbas_disk_used_bytes', 'Disk Used (Bytes)', {
                    expr: `cbas_disk_used_bytes{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('cbas_direct_memory_used_bytes', 'Direct Memory Used (Bytes)', {
                    expr: `cbas_direct_memory_used_bytes{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('cbas_gc_count_total', 'Total GC Count', {
                    expr: `cbas_gc_count_total{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('cbas_gc_time_seconds_total', 'GC Time (Seconds)', {
                    expr: `cbas_gc_time_seconds_total{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 's'
                }),
                createMetricPanel('cbas_heap_memory_committed_bytes', 'Heap Memory Committed (Bytes)', {
                    expr: `cbas_heap_memory_committed_bytes{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('cbas_heap_memory_used_bytes', 'Heap Memory Used (Bytes)', {
                    expr: `cbas_heap_memory_used_bytes{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('cbas_io_reads_total', 'Total IO Reads', {
                    expr: `cbas_io_reads_total{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('cbas_io_writes_total', 'Total IO Writes', {
                    expr: `cbas_io_writes_total{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('cbas_running_jobs', 'Running Jobs', {
                    expr: `cbas_running_jobs{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('cbas_queued_jobs', 'Queued Jobs', {
                    expr: `cbas_queued_jobs{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('cbas_jobs_total', 'Total Jobs', {
                    expr: `cbas_jobs_total{job="${snapshotId}"}`,
                    legendFormat: '{{result}} , {{instance}}',
                    snapshotId,
                    extraFields: ['d.labels.`result`', 'd.labels.`instance`'],
                    unit: 'short'
                }),
                createMetricPanel('cbas_system_load_average', 'System WorkLoad Average', {
                    expr: `cbas_system_load_average{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                // Disk usage metrics
                createMetricPanel('cbas_requests_total', 'Total Received Requests', {
                    expr: `cbas_requests_total{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('cbas_http_requests_total', 'HTTP Requests Total', {
                    expr: `cbas_http_requests_total{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),                
                // RAM usage metrics
                createMetricPanel('cbas_thread_count', 'Thread Count', {
                    expr: `cbas_thread_count{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
            ],
        })
    });
}
