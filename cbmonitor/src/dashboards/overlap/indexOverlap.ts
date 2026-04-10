import { EmbeddedScene } from '@grafana/scenes';
import { createOverlapMetricPanel } from 'utils/utils.panelOverlap';
import { createInstanceAwareOverlapScene } from 'utils/instanceScene';

export function indexOverlapMetricsDashboard(snapshotIds: string, overlapEndTimeSeconds?: number): EmbeddedScene {
  return createInstanceAwareOverlapScene(
    snapshotIds,
    ({ titleSuffix, instanceFilter, instanceSumBySuffix }) => [
      createOverlapMetricPanel('sysproc_cpu_seconds_total', `Indexer CPU Time (Cumulative Seconds)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_cpu_seconds_total{job=~"${snapshotIds}",proc="indexer"${instanceFilter}})`,
        unit: 's',
      }),
      createOverlapMetricPanel('sysproc_mem_resident', `Indexer Resident Memory (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_mem_resident{job=~"${snapshotIds}",proc="indexer"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('index_avg_disk_bps', `Index Disk Bytes per Second${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (index_avg_disk_bps{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'binBps',
      }),
      createOverlapMetricPanel('index_avg_mutation_rate', `Index Mutation Rate${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (index_avg_mutation_rate{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'ops',
      }),
      createOverlapMetricPanel('index_net_avg_scan_rate', `Index Average Scan Rate${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (index_net_avg_scan_rate{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'ops',
      }),
      createOverlapMetricPanel('index_memory_rss', `Indexer Process Resident Set Size${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (index_memory_rss{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('index_total_data_size', `Index Total Data Size${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (index_total_data_size{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('index_memory_used', `Index Memory Used${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, index, scope, collection) (index_memory_used{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{index}}, {{scope}}, {{collection}}',
        unit: 'bytes',
      }),
      createOverlapMetricPanel('index_avg_scan_latency', `Index Avg Scan Latency${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, index) (index_avg_scan_latency{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{index}}',
        unit: 'ns',
      }),
      createOverlapMetricPanel('index_cache_hits', `Index Cache Hits${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, index) (index_cache_hits{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{index}}',
        unit: 'short',
      }),
      createOverlapMetricPanel('index_cache_misses', `Index Cache Misses${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, index) (index_cache_misses{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{index}}',
        unit: 'short',
      }),
      createOverlapMetricPanel('index_num_requests', `Index Number of Requests${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, index) (index_num_requests{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{index}}',
        unit: 'short',
      }),
      createOverlapMetricPanel('index_num_rows_returned', `Index Number of Rows Returned${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, index) (index_num_rows_returned{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{index}}',
        unit: 'short',
      }),
      createOverlapMetricPanel('index_num_docs_indexed', `Index Number of Documents Indexed${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, index) (index_num_docs_indexed{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{index}}',
        unit: 'short',
      }),
      createOverlapMetricPanel('index_items_count', `Index Items Count${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, index) (index_items_count{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{index}}',
        unit: 'short',
      }),
      createOverlapMetricPanel('index_disk_size', `Index Disk Size${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, index) (index_disk_size{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{index}}',
        unit: 'bytes',
      }),
      createOverlapMetricPanel('index_avg_item_size', `Index Average Item Size${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, index) (index_avg_item_size{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{index}}',
        unit: 'bytes',
      }),
    ],
    overlapEndTimeSeconds
  );
}
