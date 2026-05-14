import { EmbeddedScene } from '@grafana/scenes';
import { createMetricPanel, createFlexLayout } from 'utils/utils.panel';

export function analyticsMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: createFlexLayout({
            children: [
                createMetricPanel('sysproc_cpu_seconds_total', 'Java CPU Usage (cores)', {
                    expr: `sum by (instance) (rate(sysproc_cpu_seconds_total{job="${snapshotId}",proc="java"}[$__rate_interval]))`,
                    snapshotId,
                    labelFilters: { proc: 'java' },
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sysproc_mem_resident', 'Java Resident Memory (Bytes)', {
                    expr: `sum by (instance) (sysproc_mem_resident{job="${snapshotId}",proc="java"})`,
                    snapshotId,
                    labelFilters: { proc: 'java' },
                    unit: 'bytes'
                }),
                 // Search (FTS)
                createMetricPanel('cbas_disk_used_bytes', 'Disk Used (Bytes)', {
                    expr: `sum by (instance) (cbas_disk_used_bytes{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('cbas_direct_memory_used_bytes', 'Direct Memory Used (Bytes)', {
                    expr: `sum by (instance) (cbas_direct_memory_used_bytes{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('cbas_gc_count_total', 'GC Events/Sec', {
                    expr: `sum by (instance) (rate(cbas_gc_count_total{job="${snapshotId}"}[$__rate_interval]))`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('cbas_gc_time_seconds_total', 'GC Time Rate (seconds-per-second)', {
                    expr: `sum by (instance) (rate(cbas_gc_time_seconds_total{job="${snapshotId}"}[$__rate_interval]))`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'percentunit'
                }),
                createMetricPanel('cbas_heap_memory_committed_bytes', 'Heap Memory Committed (Bytes)', {
                    expr: `sum by (instance) (cbas_heap_memory_committed_bytes{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('cbas_heap_memory_used_bytes', 'Heap Memory Used (Bytes)', {
                    expr: `sum by (instance) (cbas_heap_memory_used_bytes{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('cbas_io_reads_total', 'IO Reads/Sec', {
                    expr: `sum by (instance) (rate(cbas_io_reads_total{job="${snapshotId}"}[$__rate_interval]))`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('cbas_io_writes_total', 'IO Writes/Sec', {
                    expr: `sum by (instance) (rate(cbas_io_writes_total{job="${snapshotId}"}[$__rate_interval]))`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('cbas_running_jobs', 'Running Jobs', {
                    expr: `sum by (instance) (cbas_running_jobs{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('cbas_queued_jobs', 'Queued Jobs', {
                    expr: `sum by (instance) (cbas_queued_jobs{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('cbas_jobs_total', 'Jobs/Sec', {
                    expr: `sum by (result, instance) (rate(cbas_jobs_total{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{result}} , {{instance}}',
                    snapshotId,
                    extraFields: ['d.labels.`result`', 'd.labels.`instance`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('cbas_system_load_average', 'System WorkLoad Average', {
                    expr: `sum by (instance) (cbas_system_load_average{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),
                // Disk usage metrics
                createMetricPanel('cbas_requests_total', 'Received Requests/Sec', {
                    expr: `sum by (instance) (rate(cbas_requests_total{job="${snapshotId}"}[$__rate_interval]))`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('cbas_http_requests_total', 'HTTP Requests/Sec', {
                    expr: `sum by (instance) (rate(cbas_http_requests_total{job="${snapshotId}"}[$__rate_interval]))`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'short'
                }),                
                // RAM usage metrics
                createMetricPanel('cbas_thread_count', 'Thread Count', {
                    expr: `sum by (instance) (cbas_thread_count{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),
            ],
        })
    });
}
