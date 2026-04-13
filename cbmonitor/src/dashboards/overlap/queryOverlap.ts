import { EmbeddedScene } from '@grafana/scenes';
import { createInstanceAwareOverlapScene } from 'utils/instanceScene';

export function queryOverlapMetricsDashboard(snapshotIds: string, overlapEndTimeSeconds?: number): EmbeddedScene {
  return createInstanceAwareOverlapScene(
    snapshotIds,
    ({ titleSuffix, instanceFilter, instanceSumBySuffix, createOverlapMetricPanel }) => [
      createOverlapMetricPanel('sysproc_cpu_seconds_total', `Query Engine CPU Time (Cumulative Seconds)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_cpu_seconds_total{job=~"${snapshotIds}",proc="cbq-engine"${instanceFilter}})`,
        unit: 's',
      }),
      createOverlapMetricPanel('sysproc_mem_resident', `Query Engine Resident Memory (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_mem_resident{job=~"${snapshotIds}",proc="cbq-engine"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('n1ql_requests', `Query Requests${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (n1ql_requests{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('n1ql_selects', `Query Selects${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (n1ql_selects{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('n1ql_active_requests', `Query Active Requests${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (n1ql_active_requests{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('n1ql_requests_250ms', `Query Requests > 250ms${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (n1ql_requests_250ms{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('n1ql_requests_500ms', `Query Requests > 500ms${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (n1ql_requests_500ms{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('n1ql_requests_1000ms', `Query Requests > 1000ms${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (n1ql_requests_1000ms{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('n1ql_errors', `Query Errors${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (n1ql_errors{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('n1ql_result_count', `Query Result Count${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (n1ql_result_count{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('n1ql_result_size', `Query Result Size (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (n1ql_result_size{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('n1ql_invalid_requests', `Query Invalid Requests${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (n1ql_invalid_requests{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
    ],
    { instanceMetric: 'n1ql_requests', overlapEndTimeSeconds }
  );
}
