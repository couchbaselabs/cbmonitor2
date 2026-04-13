import { EmbeddedScene } from '@grafana/scenes';
import { createInstanceAwareOverlapScene } from 'utils/instanceScene';

export function clusterManagerOverlapMetricsDashboard(snapshotIds: string, overlapEndTimeSeconds?: number): EmbeddedScene {
  return createInstanceAwareOverlapScene(
    snapshotIds,
    ({ titleSuffix, instanceFilter, instanceSumBySuffix, createOverlapMetricPanel }) => [
      createOverlapMetricPanel('sysproc_cpu_seconds_total', `ns_server CPU Time (Cumulative Seconds)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_cpu_seconds_total{job=~"${snapshotIds}",proc="ns_server"${instanceFilter}})`,
        unit: 's',
      }),
      createOverlapMetricPanel('sysproc_mem_resident', `ns_server Resident Memory (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_mem_resident{job=~"${snapshotIds}",proc="ns_server"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('sysproc_cpu_seconds_total', `Prometheus CPU Time (Cumulative Seconds)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_cpu_seconds_total{job=~"${snapshotIds}",proc="prometheus"${instanceFilter}})`,
        unit: 's',
      }),
      createOverlapMetricPanel('sysproc_mem_resident', `Prometheus Resident Memory (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_mem_resident{job=~"${snapshotIds}",proc="prometheus"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('sys_cpu_cores_available', `CPU Cores Available${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sys_cpu_cores_available{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('cm_http_requests_total', `HTTP Requests Total${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, method) (cm_http_requests_total{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{method}}',
        unit: 'short',
        width: '100%',
      }),
    ],
    { overlapEndTimeSeconds }
  );
}
