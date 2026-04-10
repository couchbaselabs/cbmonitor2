import { EmbeddedScene } from '@grafana/scenes';
import { createOverlapMetricPanel } from 'utils/utils.panelOverlap';
import { createInstanceAwareOverlapScene } from 'utils/instanceScene';

export function ftsOverlapMetricsDashboard(snapshotIds: string, overlapEndTimeSeconds?: number): EmbeddedScene {
  return createInstanceAwareOverlapScene(
    snapshotIds,
    ({ titleSuffix, instanceFilter, instanceSumBySuffix }) => [
      createOverlapMetricPanel('sysproc_cpu_seconds_total', `Search CPU Time (Cumulative Seconds)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_cpu_seconds_total{job=~"${snapshotIds}",proc="cbft"${instanceFilter}})`,
        unit: 's',
      }),
      createOverlapMetricPanel('sysproc_mem_resident', `Search Resident Memory (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_mem_resident{job=~"${snapshotIds}",proc="cbft"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('fts_total_queries', `Total Queries${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (fts_total_queries{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('fts_total_request_time', `Total Request Time${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (fts_total_request_time{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'ns',
      }),
      createOverlapMetricPanel('fts_total_queries_error', `Total Queries Error${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (fts_total_queries_error{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('fts_total_bytes_query_results', `Total Bytes Query Results${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (fts_total_bytes_query_results{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('fts_total_queries_slow', `Total Queries Slow${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (fts_total_queries_slow{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('fts_total_queries_timeout', `Total Queries Timeout${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (fts_total_queries_timeout{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('fts_total_gc', `Total GC${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (fts_total_gc{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('fts_pct_cpu_gc', `CPU GC (%)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (fts_pct_cpu_gc{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'percent',
      }),
      createOverlapMetricPanel('fts_num_bytes_used_disk', `Disk Usage (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (fts_num_bytes_used_disk{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('fts_num_files_on_disk', `Number of Files on Disk${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (fts_num_files_on_disk{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('fts_num_bytes_used_ram', `RAM Usage (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (fts_num_bytes_used_ram{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'bytes',
      }),
    ],
    "fts_total_queries",
    overlapEndTimeSeconds
  );
}
