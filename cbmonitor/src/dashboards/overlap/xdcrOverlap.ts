import { EmbeddedScene } from '@grafana/scenes';
import { createOverlapMetricPanel } from 'utils/utils.panelOverlap';
import { createInstanceAwareOverlapScene } from 'utils/instanceScene';

export function xdcrOverlapMetricsDashboard(snapshotIds: string, overlapEndTimeSeconds?: number): EmbeddedScene {
  return createInstanceAwareOverlapScene(
    snapshotIds,
    ({ titleSuffix, instanceFilter, instanceSumBySuffix }) => [
      createOverlapMetricPanel('sysproc_cpu_seconds_total', `goxdcr CPU Time (Cumulative Seconds)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_cpu_seconds_total{job=~"${snapshotIds}",proc="goxdcr"${instanceFilter}})`,
        unit: 's',
      }),
      createOverlapMetricPanel('sysproc_mem_resident', `goxdcr Resident Memory (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_mem_resident{job=~"${snapshotIds}",proc="goxdcr"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('xdcr_changes_left_total', `Changes Left Total${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (xdcr_changes_left_total{job=~"${snapshotIds}",pipelineType="Main"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('xdcr_docs_cloned_total', `Documents Cloned Total${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (xdcr_docs_cloned_total{job=~"${snapshotIds}",pipelineType="Main"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('xdcr_docs_checked_total', `Documents Checked Total${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (xdcr_docs_checked_total{job=~"${snapshotIds}",pipelineType="Main"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('xdcr_docs_written_total', `Documents Written Total${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (xdcr_docs_written_total{job=~"${snapshotIds}",pipelineType="Main"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('xdcr_wtavg_docs_latency_seconds', `Weighted Average Document Latency (Seconds)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (xdcr_wtavg_docs_latency_seconds{job=~"${snapshotIds}",pipelineType="Main"${instanceFilter}})`,
        unit: 's',
      }),
      createOverlapMetricPanel('xdcr_wtavg_meta_latency_seconds', `Weighted Average Metadata Latency (Seconds)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (xdcr_wtavg_meta_latency_seconds{job=~"${snapshotIds}",pipelineType="Main"${instanceFilter}})`,
        unit: 's',
      }),
      createOverlapMetricPanel('xdcr_data_replicated_bytes', `Data Replicated (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (xdcr_data_replicated_bytes{job=~"${snapshotIds}",pipelineType="Main"${instanceFilter}})`,
        unit: 'bytes',
      }),
    ],
    { instanceMetric: 'xdcr_changes_left_total', overlapEndTimeSeconds }
  );
}
