import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';

export function ftsMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                 // Search (FTS)
                createMetricPanel('sysproc_cpu_seconds_total', 'Search CPU Time (Cumulative Seconds)', {
                    expr: `sysproc_cpu_seconds_total{job="${snapshotId}",proc="cbft"}`,
                    snapshotId,
                    labelFilters: { proc: 'cbft' },
                    unit: 's'
                }),
                createMetricPanel('sysproc_mem_resident', 'Search Resident Memory (Bytes)', {
                    expr: `sysproc_mem_resident{job="${snapshotId}",proc="cbft"}`,
                    snapshotId,
                    labelFilters: { proc: 'cbft' },
                    unit: 'bytes'
                }),
                createMetricPanel('fts_total_queries', 'Total Queries', {
                    expr: `fts_total_queries{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('fts_total_request_time', 'Total Requets Time', {
                    expr: `fts_total_request_time{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'ns'
                }),
                createMetricPanel('fts_total_queries_error', 'Total Queries Error', {
                    expr: `fts_total_queries_error{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('fts_total_bytes_query_results', 'Total Bytes Query Results', {
                    expr: `fts_total_bytes_query_results{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('fts_total_queries_slow', 'Total Queries Slow', {
                    expr: `fts_total_queries_slow{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('fts_total_queries_timeout', 'Total Queries Timeout', {
                    expr: `fts_total_queries_timeout{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('fts_total_gc', 'Total GC', {
                    expr: `fts_total_gc{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('fts_pct_cpu_gc', 'CPU GC (%)', {
                    expr: `fts_pct_cpu_gc{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'percent'
                }),
                // Disk usage metrics
                createMetricPanel('fts_num_bytes_used_disk', 'Disk Usage (Bytes)', {
                    expr: `fts_num_bytes_used_disk{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('fts_num_files_on_disk', 'Number of Files on Disk', {
                    expr: `fts_num_files_on_disk{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                // RAM usage metrics
                createMetricPanel('fts_num_bytes_used_ram', 'RAM Usage (Bytes)', {
                    expr: `fts_num_bytes_used_ram{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
            ],
        })
    });
}
