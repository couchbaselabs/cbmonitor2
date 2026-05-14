import { EmbeddedScene } from '@grafana/scenes';
import { createInstanceAwareOverlapScene } from 'utils/instanceScene';

export function ftsOverlapMetricsDashboard(snapshotIds: string, overlapEndTimeSeconds?: number): EmbeddedScene {
  return createInstanceAwareOverlapScene(
    snapshotIds,
    ({ titleSuffix, instanceFilter, instanceSumBySuffix, createOverlapMetricPanel }) => [
      createOverlapMetricPanel('sysproc_cpu_seconds_total', `Search CPU Usage (cores)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (rate(sysproc_cpu_seconds_total{job=~"${snapshotIds}",proc="cbft"${instanceFilter}}[$__rate_interval]))`,
        unit: 'short',
      }),
      createOverlapMetricPanel('sysproc_mem_resident', `Search Resident Memory (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_mem_resident{job=~"${snapshotIds}",proc="cbft"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('fts_total_queries', `Queries/Sec${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (rate(fts_total_queries{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
        unit: 'short',
      }),
      createOverlapMetricPanel('fts_total_request_time', `Request Time Rate (ns/sec)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (rate(fts_total_request_time{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
        unit: 'short',
      }),
      createOverlapMetricPanel('fts_total_queries_error', `Queries Error/Sec${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (rate(fts_total_queries_error{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
        unit: 'short',
      }),
      createOverlapMetricPanel('fts_total_bytes_query_results', `Query Result Bytes/Sec${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (rate(fts_total_bytes_query_results{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
        unit: 'Bps',
      }),
      createOverlapMetricPanel('fts_total_queries_slow', `Queries Slow/Sec${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (rate(fts_total_queries_slow{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
        unit: 'short',
      }),
      createOverlapMetricPanel('fts_total_queries_timeout', `Queries Timeout/Sec${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (rate(fts_total_queries_timeout{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
        unit: 'short',
      }),
      createOverlapMetricPanel('fts_total_gc', `GC Events/Sec${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (rate(fts_total_gc{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
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
    { instanceMetric: 'fts_total_queries', overlapEndTimeSeconds }
  );
}
