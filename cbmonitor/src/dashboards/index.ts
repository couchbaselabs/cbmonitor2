import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';

// TO DO: add a way to select which indexes you want to compare
// TO DO: add a way to select which indexes you want to compare
export function indexMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                // Indexer
                createMetricPanel(snapshotId, 'sysproc_cpu_seconds_total', 'Indexer CPU Time (Cumulative Seconds)', {
                    labelFilters: { proc: 'indexer' },
                    unit: 's'
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'Indexer Resident Memory (Bytes)', {
                    labelFilters: { proc: 'indexer' },
                    unit: 'bytes'
                }),
                // Latency and throughput metrics
                createMetricPanel(snapshotId, 'index_avg_disk_bps', 'Index Disk Bytes per Second',{
                    unit: 'binBps'
                }),
                createMetricPanel(snapshotId, 'index_avg_mutation_rate', 'Index Mutation Rate', {
                    unit: 'ops'
                }),
                createMetricPanel(snapshotId, 'index_net_avg_scan_rate', 'Index Average Scan Rate', {
                    unit: 'ops'
                }),
                createMetricPanel(snapshotId, 'index_memory_rss', 'Indexer Process Resident Set Size', {
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'index_memory_used', 'Index Memory Used', {
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'index_total_data_size', 'Index Total Data Size', {
                    unit: 'bytes'
                }),
                // Per-index metrics
                createMetricPanel(snapshotId, 'index_avg_scan_latency', 'Index Average Scan Latency', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'ns'
                }),
                createMetricPanel(snapshotId, 'index_cache_hits', 'Index Cache Hits', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'], 
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'index_cache_misses', 'Index Cache Misses', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'index_num_requests', 'Index Number of Requests', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'index_num_rows_returned', 'Index Number of Rows Returned', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'index_num_docs_indexed', 'Index Number of Documents Indexed', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'index_items_count', 'Index Items Count', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'index_disk_size', 'Index Disk Size', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'index_avg_item_size', 'Index Average Item Size', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'bytes'
                }),
            ],
        })
    });
}
