import { EmbeddedScene } from '@grafana/scenes';
import { createInstanceAwareOverlapScene } from 'utils/instanceScene';


export function analyticsOverlapMetricsDashboard(snapshotIds: string, overlapEndTimeSeconds?: number): EmbeddedScene {

    return createInstanceAwareOverlapScene(snapshotIds, ({ titleSuffix, instanceFilter, instanceSumBySuffix, createOverlapMetricPanel
     }) => {

        return [
        createOverlapMetricPanel('sysproc_cpu_seconds_total', `Java CPU Usage (cores)${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (rate(sysproc_cpu_seconds_total{job=~"${snapshotIds}",proc="java"${instanceFilter}}[$__rate_interval]))`,
            unit: 'short'
        }),
        createOverlapMetricPanel('sysproc_mem_resident', `Java Resident Memory (Bytes)${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (sysproc_mem_resident{job=~"${snapshotIds}",proc="java"${instanceFilter}})`,
            unit: 'bytes'
        }),
        // Search (FTS)
        createOverlapMetricPanel('cbas_disk_used_bytes', `Disk Used (Bytes)${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (cbas_disk_used_bytes{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('cbas_direct_memory_used_bytes', `Direct Memory Used (Bytes)${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (cbas_direct_memory_used_bytes{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('cbas_gc_count_total', `GC Events/Sec${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (rate(cbas_gc_count_total{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
            unit: 'short'
        }),
        createOverlapMetricPanel('cbas_gc_time_seconds_total', `GC Time Rate (seconds-per-second)${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (rate(cbas_gc_time_seconds_total{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
            unit: 'percentunit'
        }),
        createOverlapMetricPanel('cbas_heap_memory_committed_bytes', `Heap Memory Committed (Bytes)${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (cbas_heap_memory_committed_bytes{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('cbas_heap_memory_used_bytes', `Heap Memory Used (Bytes)${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (cbas_heap_memory_used_bytes{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('cbas_io_reads_total', `IO Reads/Sec${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (rate(cbas_io_reads_total{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
            unit: 'short'
        }),
        createOverlapMetricPanel('cbas_io_writes_total', `IO Writes/Sec${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (rate(cbas_io_writes_total{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
            unit: 'short'
        }),
        createOverlapMetricPanel('cbas_running_jobs', `Running Jobs${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (cbas_running_jobs{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'short'
        }),
        createOverlapMetricPanel('cbas_queued_jobs', `Queued Jobs${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (cbas_queued_jobs{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'short'
        }),
        createOverlapMetricPanel('cbas_jobs_total', `Jobs/Sec${titleSuffix}`, {
            expr: `sum by (result, job${instanceSumBySuffix}) (rate(cbas_jobs_total{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
            unit: 'short'
        }),
        createOverlapMetricPanel('cbas_system_load_average', `System WorkLoad Average${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (cbas_system_load_average{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'short'
        }),
        // Disk usage metrics
        createOverlapMetricPanel('cbas_requests_total', `Received Requests/Sec${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (rate(cbas_requests_total{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
            unit: 'short'
        }),
        createOverlapMetricPanel('cbas_http_requests_total', `HTTP Requests/Sec${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (rate(cbas_http_requests_total{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
            unit: 'short'
        }),
        // RAM usage metrics
        createOverlapMetricPanel('cbas_thread_count', `Thread Count${titleSuffix}`, {
            expr: `sum by (job${instanceSumBySuffix}) (cbas_thread_count{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'short'
        }),
    ];
    }, { instanceMetric: 'cbas_io_writes_total', overlapEndTimeSeconds });
}
