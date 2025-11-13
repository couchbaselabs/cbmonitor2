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
                createMetricPanel(snapshotId, 'sysproc_cpu_utilization', 'Search CPU Utilization (%)', {
                    labelFilters: { proc: 'cbft' },
                    unit: 'percent'
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'Search Resident Memory (Bytes)', {
                    labelFilters: { proc: 'cbft' },
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'fts_total_queries', 'Total Queries', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'fts_total_request_time', 'Total Requets Time', {
                    unit: 'ns'
                }),
                createMetricPanel(snapshotId, 'fts_total_queries_error', 'Total Queries Error', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'fts_total_bytes_query_results', 'Total Bytes Query Results', {
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'fts_total_queries_slow', 'Total Queries Slow', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'fts_total_queries_timeout', 'Total Queries Timeout', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'fts_total_gc', 'Total GC', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'fts_pct_cpu_gc', 'CPU GC (%)', {
                    unit: 'percent'
                }),
                // Disk usage metrics
                createMetricPanel(snapshotId, 'fts_num_bytes_used_disk', 'Disk Usage (Bytes)', {
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'fts_num_files_on_disk', 'Number of Files on Disk', {
                    unit: 'short'
                }),
                // RAM usage metrics
                createMetricPanel(snapshotId, 'fts_num_bytes_used_ram', 'RAM Usage (Bytes)', {
                    unit: 'bytes'
                }),
            ],
        })
    });
}
