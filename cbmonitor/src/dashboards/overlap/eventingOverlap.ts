import { EmbeddedScene } from '@grafana/scenes';
import { createOverlapMetricPanel } from 'utils/utils.panelOverlap';
import { createInstanceAwareOverlapScene } from 'utils/instanceScene';

export function eventingOverlapMetricsDashboard(snapshotIds: string, overlapEndTimeSeconds?: number): EmbeddedScene {
  return createInstanceAwareOverlapScene(
    snapshotIds,
    ({ titleSuffix, instanceFilter, instanceSumBySuffix }) => [
      createOverlapMetricPanel('sysproc_cpu_seconds_total', `Eventing CPU Time (Cumulative Seconds)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_cpu_seconds_total{job=~"${snapshotIds}",proc="eventing-produc"${instanceFilter}})`,
        unit: 's',
      }),
      createOverlapMetricPanel('sysproc_mem_resident', `Eventing Resident Memory (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_mem_resident{job=~"${snapshotIds}",proc="eventing-produc"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('eventing_worker_restart_count', `Worker Restart Count${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (eventing_worker_restart_count{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
        width: '100%',
      }),
    ],
    overlapEndTimeSeconds
  );
}
