import { EmbeddedScene } from '@grafana/scenes';
import { createOverlapMetricPanel } from 'utils/utils.panelOverlap';
import { createInstanceAwareOverlapScene } from 'utils/instanceScene';


export function analyticsOverlapMetricsDashboard(snapshotIds: string): EmbeddedScene {

    return createInstanceAwareOverlapScene(
            snapshotIds,
            (i: string) => [
                createOverlapMetricPanel('sysproc_cpu_seconds_total', 'Java CPU Time (Cumulative Seconds)', {
                    expr: `sum by (instance) (sysproc_cpu_seconds_total{job="${snapshotIds}",proc="java"})`,
                    unit: 's'
                }),
                createOverlapMetricPanel('sysproc_mem_resident', 'Java Resident Memory (Bytes)', {
                    expr: `sum by (instance) (sysproc_mem_resident{job="${snapshotIds}",proc="java"})`,
                    unit: 'bytes'
                }),
                 // Search (FTS)
                createOverlapMetricPanel('cbas_disk_used_bytes', 'Disk Used (Bytes)', {
                    expr: `sum by (instance) (cbas_disk_used_bytes{job="${snapshotIds}"})`,
                    unit: 'bytes'
                }),
                createOverlapMetricPanel('cbas_direct_memory_used_bytes', 'Direct Memory Used (Bytes)', {
                    expr: `sum by (instance) (cbas_direct_memory_used_bytes{job="${snapshotIds}"})`,
                    unit: 'bytes'
                }),
                createOverlapMetricPanel('cbas_gc_count_total', 'Total GC Count', {
                    expr: `sum by (instance) (cbas_gc_count_total{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_gc_time_seconds_total', 'GC Time (Seconds)', {
                    expr: `sum by (instance) (cbas_gc_time_seconds_total{job="${snapshotIds}"})`,
                    unit: 's'
                }),
                createOverlapMetricPanel('cbas_heap_memory_committed_bytes', 'Heap Memory Committed (Bytes)', {
                    expr: `sum by (instance) (cbas_heap_memory_committed_bytes{job="${snapshotIds}"})`,
                    unit: 'bytes'
                }),
                createOverlapMetricPanel('cbas_heap_memory_used_bytes', 'Heap Memory Used (Bytes)', {
                    expr: `sum by (instance) (cbas_heap_memory_used_bytes{job="${snapshotIds}"})`,
                    unit: 'bytes'
                }),
                createOverlapMetricPanel('cbas_io_reads_total', 'Total IO Reads', {
                    expr: `sum by (instance) (cbas_io_reads_total{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_io_writes_total', 'Total IO Writes', {
                    expr: `sum by (instance) (cbas_io_writes_total{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_running_jobs', 'Running Jobs', {
                    expr: `sum by (instance) (cbas_running_jobs{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_queued_jobs', 'Queued Jobs', {
                    expr: `sum by (instance) (cbas_queued_jobs{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_jobs_total', 'Total Jobs', {
                    expr: `sum by (result, instance) (cbas_jobs_total{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_system_load_average', 'System WorkLoad Average', {
                    expr: `sum by (instance) (cbas_system_load_average{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                // Disk usage metrics
                createOverlapMetricPanel('cbas_requests_total', 'Total Received Requests', {
                    expr: `sum by (instance) (cbas_requests_total{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_http_requests_total', 'HTTP Requests Total', {
                    expr: `sum by (instance) (cbas_http_requests_total{job="${snapshotIds}"})`,
                    unit: 'short'
                }),                
                // RAM usage metrics
                createOverlapMetricPanel('cbas_thread_count', 'Thread Count', {
                    expr: `sum by (instance) (cbas_thread_count{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
            ],
            () => [
                createOverlapMetricPanel('sysproc_cpu_seconds_total', 'Java CPU Time (Cumulative Seconds)', {
                    expr: `sum by (instance) (sysproc_cpu_seconds_total{job="${snapshotIds}",proc="java"})`,
                    unit: 's'
                }),
                createOverlapMetricPanel('sysproc_mem_resident', 'Java Resident Memory (Bytes)', {
                    expr: `sum by (instance) (sysproc_mem_resident{job="${snapshotIds}",proc="java"})`,
                    unit: 'bytes'
                }),
                 // Search (FTS)
                createOverlapMetricPanel('cbas_disk_used_bytes', 'Disk Used (Bytes)', {
                    expr: `sum by (instance) (cbas_disk_used_bytes{job="${snapshotIds}"})`,
                    unit: 'bytes'
                }),
                createOverlapMetricPanel('cbas_direct_memory_used_bytes', 'Direct Memory Used (Bytes)', {
                    expr: `sum by (instance) (cbas_direct_memory_used_bytes{job="${snapshotIds}"})`,
                    unit: 'bytes'
                }),
                createOverlapMetricPanel('cbas_gc_count_total', 'Total GC Count', {
                    expr: `sum by (instance) (cbas_gc_count_total{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_gc_time_seconds_total', 'GC Time (Seconds)', {
                    expr: `sum by (instance) (cbas_gc_time_seconds_total{job="${snapshotIds}"})`,
                    unit: 's'
                }),
                createOverlapMetricPanel('cbas_heap_memory_committed_bytes', 'Heap Memory Committed (Bytes)', {
                    expr: `sum by (instance) (cbas_heap_memory_committed_bytes{job="${snapshotIds}"})`,
                    unit: 'bytes'
                }),
                createOverlapMetricPanel('cbas_heap_memory_used_bytes', 'Heap Memory Used (Bytes)', {
                    expr: `sum by (instance) (cbas_heap_memory_used_bytes{job="${snapshotIds}"})`,
                    unit: 'bytes'
                }),
                createOverlapMetricPanel('cbas_io_reads_total', 'Total IO Reads', {
                    expr: `sum by (instance) (cbas_io_reads_total{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_io_writes_total', 'Total IO Writes', {
                    expr: `sum by (instance) (cbas_io_writes_total{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_running_jobs', 'Running Jobs', {
                    expr: `sum by (instance) (cbas_running_jobs{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_queued_jobs', 'Queued Jobs', {
                    expr: `sum by (instance) (cbas_queued_jobs{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_jobs_total', 'Total Jobs', {
                    expr: `sum by (result, instance) (cbas_jobs_total{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_system_load_average', 'System WorkLoad Average', {
                    expr: `sum by (instance) (cbas_system_load_average{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                // Disk usage metrics
                createOverlapMetricPanel('cbas_requests_total', 'Total Received Requests', {
                    expr: `sum by (instance) (cbas_requests_total{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
                createOverlapMetricPanel('cbas_http_requests_total', 'HTTP Requests Total', {
                    expr: `sum by (instance) (cbas_http_requests_total{job="${snapshotIds}"})`,
                    unit: 'short'
                }),                
                // RAM usage metrics
                createOverlapMetricPanel('cbas_thread_count', 'Thread Count', {
                    expr: `sum by (instance) (cbas_thread_count{job="${snapshotIds}"})`,
                    unit: 'short'
                }),
            ],
    );
}
