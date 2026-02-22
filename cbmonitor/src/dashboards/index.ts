import { EmbeddedScene } from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';
import { createInstanceAwareScene } from 'utils/instanceScene';

// TO DO: add a way to select which indexes you want to compare
// TO DO: add a way to select which indexes you want to compare
export function indexMetricsDashboard(snapshotId: string): EmbeddedScene {
    const buildBaseChildren = () => [
        // Indexer
        createMetricPanel('sysproc_cpu_seconds_total', 'Indexer CPU Time (Cumulative Seconds)', {
            expr: `sysproc_cpu_seconds_total{job="${snapshotId}",proc="indexer"}`,
            legendFormat: '{{instance}} , {{mode}}',
            snapshotId,
            labelFilters: { proc: 'indexer' },
            extraFields: ['d.labels.`instance`', 'd.labels.`mode`'],
            unit: 's',
        }),
        createMetricPanel('sysproc_mem_resident', 'Indexer Resident Memory (Bytes)', {
            expr: `sysproc_mem_resident{job="${snapshotId}",proc="indexer"}`,
            legendFormat: '{{instance}} , {{index}} , {{mode}}',
            snapshotId,
            labelFilters: { proc: 'indexer' },
            extraFields: ['d.labels.`instance`', 'd.labels.`index`', 'd.labels.`mode`'],
            unit: 'bytes',
        }),
        // Latency and throughput metrics
        createMetricPanel('index_avg_disk_bps', 'Index Disk Bytes per Second', {
            expr: `index_avg_disk_bps{job="${snapshotId}"}`,
            snapshotId,
            unit: 'binBps',
        }),
        createMetricPanel('index_avg_mutation_rate', 'Index Mutation Rate', {
            expr: `index_avg_mutation_rate{job="${snapshotId}"}`,
            snapshotId,
            unit: 'ops',
        }),
        createMetricPanel('index_net_avg_scan_rate', 'Index Average Scan Rate', {
            expr: `index_net_avg_scan_rate{job="${snapshotId}"}`,
            snapshotId,
            unit: 'ops',
        }),
        createMetricPanel('index_memory_rss', 'Indexer Process Resident Set Size', {
            expr: `index_memory_rss{job="${snapshotId}"}`,
            snapshotId,
            unit: 'bytes',
        }),
        createMetricPanel('index_memory_used', 'Index Memory Used', {
            expr: `index_memory_used{job="${snapshotId}"}`,
            legendFormat: '{{bucket}} , {{index}} , {{scope}} , {{collection}}',
            snapshotId,
            extraFields: ['d.labels.`bucket`', 'd.labels.`index`', 'd.labels.`scope`', 'd.labels.`collection`'],
            unit: 'bytes',
        }),
        createMetricPanel('index_total_data_size', 'Index Total Data Size', {
            expr: `index_total_data_size{job="${snapshotId}"}`,
            snapshotId,
            unit: 'bytes',
        }),
    ];

    return createInstanceAwareScene(
        snapshotId,
        'index_avg_scan_latency',
        buildBaseChildren,
        (i: string) => [
            createMetricPanel('index_avg_scan_latency', `Index Avg Scan Latency (${i})`, {
                expr: `index_avg_scan_latency{job="${snapshotId}",instance="${i}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                labelFilters: { instance: i },
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'ns',
            }),
            createMetricPanel('index_cache_hits', `Index Cache Hits (${i})`, {
                expr: `index_cache_hits{job="${snapshotId}",instance="${i}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                labelFilters: { instance: i },
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'short',
            }),
            createMetricPanel('index_cache_misses', `Index Cache Misses (${i})`, {
                expr: `index_cache_misses{job="${snapshotId}",instance="${i}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                labelFilters: { instance: i },
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'short',
            }),
            createMetricPanel('index_num_requests', `Index Number of Requests (${i})`, {
                expr: `index_num_requests{job="${snapshotId}",instance="${i}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                labelFilters: { instance: i },
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'short',
            }),
            createMetricPanel('index_num_rows_returned', `Index Number of Rows Returned (${i})`, {
                expr: `index_num_rows_returned{job="${snapshotId}",instance="${i}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                labelFilters: { instance: i },
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'short',
            }),
            createMetricPanel('index_num_docs_indexed', `Index Number of Documents Indexed (${i})`, {
                expr: `index_num_docs_indexed{job="${snapshotId}",instance="${i}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                labelFilters: { instance: i },
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'short',
            }),
            createMetricPanel('index_items_count', `Index Items Count (${i})`, {
                expr: `index_items_count{job="${snapshotId}",instance="${i}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                labelFilters: { instance: i },
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'short',
            }),
            createMetricPanel('index_disk_size', `Index Disk Size (${i})`, {
                expr: `index_disk_size{job="${snapshotId}",instance="${i}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                labelFilters: { instance: i },
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'bytes',
            }),
            createMetricPanel('index_avg_item_size', `Index Average Item Size (${i})`, {
                expr: `index_avg_item_size{job="${snapshotId}",instance="${i}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                labelFilters: { instance: i },
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'bytes',
            }),
        ],
        () => [
            createMetricPanel('index_avg_scan_latency', 'Index Average Scan Latency', {
                expr: `index_avg_scan_latency{job="${snapshotId}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'ns',
            }),
            createMetricPanel('index_cache_hits', 'Index Cache Hits', {
                expr: `index_cache_hits{job="${snapshotId}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'short',
            }),
            createMetricPanel('index_cache_misses', 'Index Cache Misses', {
                expr: `index_cache_misses{job="${snapshotId}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'short',
            }),
            createMetricPanel('index_num_requests', 'Index Number of Requests', {
                expr: `index_num_requests{job="${snapshotId}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'short',
            }),
            createMetricPanel('index_num_rows_returned', 'Index Number of Rows Returned', {
                expr: `index_num_rows_returned{job="${snapshotId}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'short',
            }),
            createMetricPanel('index_num_docs_indexed', 'Index Number of Documents Indexed', {
                expr: `index_num_docs_indexed{job="${snapshotId}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'short',
            }),
            createMetricPanel('index_items_count', 'Index Items Count', {
                expr: `index_items_count{job="${snapshotId}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'short',
            }),
            createMetricPanel('index_disk_size', 'Index Disk Size', {
                expr: `index_disk_size{job="${snapshotId}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'bytes',
            }),
            createMetricPanel('index_avg_item_size', 'Index Average Item Size', {
                expr: `index_avg_item_size{job="${snapshotId}"}`,
                legendFormat: '{{bucket}} , {{index}}',
                snapshotId,
                extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                unit: 'bytes',
            }),
        ]
    );
}
