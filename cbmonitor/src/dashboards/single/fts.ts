import { EmbeddedScene } from '@grafana/scenes';
import { createMetricPanel, createFlexLayout } from 'utils/utils.panel';

export function ftsMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: createFlexLayout({
            minHeight: 50,
            direction: 'row',
            wrap: 'wrap',
            children: [
                 // Search (FTS)
                createMetricPanel('sysproc_cpu_seconds_total', 'Search CPU Usage (cores)', {
                    expr: `sum by (instance) (rate(sysproc_cpu_seconds_total{job="${snapshotId}",proc="cbft"}[$__rate_interval]))`,
                    snapshotId,
                    labelFilters: { proc: 'cbft' },
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sysproc_mem_resident', 'Search Resident Memory (Bytes)', {
                    expr: `sum by (instance) (sysproc_mem_resident{job="${snapshotId}",proc="cbft"})`,
                    snapshotId,
                    labelFilters: { proc: 'cbft' },
                    unit: 'bytes'
                }),
                createMetricPanel('fts_total_queries', 'Queries/Sec', {
                    expr: `sum by (instance) (rate(fts_total_queries{job="${snapshotId}"}[$__rate_interval]))`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('fts_total_request_time', 'Request Time Rate (ns/sec)', {
                    expr: `sum by (instance) (rate(fts_total_request_time{job="${snapshotId}"}[$__rate_interval]))`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('fts_total_queries_error', 'Queries Error/Sec', {
                    expr: `sum by (instance) (rate(fts_total_queries_error{job="${snapshotId}"}[$__rate_interval]))`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('fts_total_bytes_query_results', 'Query Result Bytes/Sec', {
                    expr: `sum by (instance) (rate(fts_total_bytes_query_results{job="${snapshotId}"}[$__rate_interval]))`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'Bps'
                }),
                createMetricPanel('fts_total_queries_slow', 'Queries Slow/Sec', {
                    expr: `sum by (instance) (rate(fts_total_queries_slow{job="${snapshotId}"}[$__rate_interval]))`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('fts_total_queries_timeout', 'Queries Timeout/Sec', {
                    expr: `sum by (instance) (rate(fts_total_queries_timeout{job="${snapshotId}"}[$__rate_interval]))`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('fts_total_gc', 'GC Events/Sec', {
                    expr: `sum by (instance) (rate(fts_total_gc{job="${snapshotId}"}[$__rate_interval]))`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('fts_pct_cpu_gc', 'CPU GC (%)', {
                    expr: `sum by (instance) (fts_pct_cpu_gc{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'percent'
                }),
                // Disk usage metrics
                createMetricPanel('fts_num_bytes_used_disk', 'Disk Usage (Bytes)', {
                    expr: `sum by (instance) (fts_num_bytes_used_disk{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('fts_num_files_on_disk', 'Number of Files on Disk', {
                    expr: `sum by (instance) (fts_num_files_on_disk{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),
                // RAM usage metrics
                createMetricPanel('fts_num_bytes_used_ram', 'RAM Usage (Bytes)', {
                    expr: `sum by (instance) (fts_num_bytes_used_ram{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'bytes'
                }),
            ],
        })
    });
}
