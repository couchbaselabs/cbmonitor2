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
                createMetricPanel(snapshotId, 'fts_total_queries', 'Total Queries'),
                createMetricPanel(snapshotId, 'fts_total_request_time', 'Average Query Time'),
                createMetricPanel(snapshotId, 'fts_total_queries_error', 'Total Queries Error'),
                createMetricPanel(snapshotId, 'fts_total_bytes_query_results', 'Total Bytes Query Results'),
                createMetricPanel(snapshotId, 'fts_total_queries_slow', 'Total Queries Slow'),
                createMetricPanel(snapshotId, 'fts_total_queries_timeout', 'Total Queries Timeout'),
                createMetricPanel(snapshotId, 'fts_total_gc', 'Total GC'),
                createMetricPanel(snapshotId, 'fts_pct_cpu_gc', 'CPU GC (%)'),
                // Disk usage metrics
                createMetricPanel(snapshotId, 'fts_num_bytes_used_disk', 'Disk Usage (Bytes)'),
                createMetricPanel(snapshotId, 'fts_num_files_on_disk', 'Number of Files on Disk'),
                // RAM usage metrics
                createMetricPanel(snapshotId, 'fts_num_bytes_used_ram', 'RAM Usage (Bytes)'),
            ],
        })
    });
}
