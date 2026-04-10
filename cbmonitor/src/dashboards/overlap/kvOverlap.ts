import { EmbeddedScene } from '@grafana/scenes';
import { createOverlapMetricPanel } from 'utils/utils.panelOverlap';
import { createInstanceAwareOverlapScene } from 'utils/instanceScene';

export function kvOverlapMetricsDashboard(snapshotIds: string, overlapEndTimeSeconds?: number): EmbeddedScene {
  return createInstanceAwareOverlapScene(
    snapshotIds,
    ({ titleSuffix, instanceFilter, instanceSumBySuffix }) => [
      createOverlapMetricPanel('sysproc_cpu_seconds_total', `memcached CPU Time (Cumulative Seconds)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_cpu_seconds_total{job=~"${snapshotIds}",proc="memcached"${instanceFilter}})`,
        unit: 's',
      }),
      createOverlapMetricPanel('sysproc_mem_resident', `memcached Resident Memory (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (sysproc_mem_resident{job=~"${snapshotIds}",proc="memcached"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('kv_vb_ops_get', `vBucket GET Ops${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket) (kv_vb_ops_get{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}',
        unit: 'short',
      }),
      createOverlapMetricPanel('kv_curr_items', `Current Items Count${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (kv_curr_items{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('kv_curr_connections', `Current Connections Count${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (kv_curr_connections{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('kv_mem_used_bytes', `KV Memory Usage (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (kv_mem_used_bytes{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('kv_ep_meta_data_memory_bytes', `Metadata Memory Usage (Bytes)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (kv_ep_meta_data_memory_bytes{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'bytes',
      }),
      createOverlapMetricPanel('kv_ep_diskqueue_fill', `KV Engine Disk Queue Fill${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (kv_ep_diskqueue_fill{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('kv_ep_diskqueue_drain', `KV Engine Disk Queue Drain${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (kv_ep_diskqueue_drain{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('kv_ep_queue_size', `KV Engine Queue Size${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (kv_ep_queue_size{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('kv_vb_queue_size', `vBucket Queue Size${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (kv_vb_queue_size{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 'short',
      }),
      createOverlapMetricPanel('kv_vb_queue_age_seconds', `vBucket Queue Age (Seconds)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}) (kv_vb_queue_age_seconds{job=~"${snapshotIds}"${instanceFilter}})`,
        unit: 's',
      }),
      createOverlapMetricPanel('kv_dcp_items_sent', `DCP Items Sent (Items/Sec)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, connection_type) (rate(kv_dcp_items_sent{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{connection_type}}',
        unit: 'short',
      }),
      createOverlapMetricPanel('kv_dcp_connection_count', `Current DCP Connection Count${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, connection_type) (kv_dcp_connection_count{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{connection_type}}',
        unit: 'short',
      }),
      createOverlapMetricPanel('kv_dcp_backoff', `DCP Backoff${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, connection_type) (kv_dcp_backoff{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{connection_type}}',
        unit: 'short',
      }),
      createOverlapMetricPanel('kv_dcp_items_remaining', `DCP Items Remaining${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, connection_type) (kv_dcp_items_remaining{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{connection_type}}',
        unit: 'short',
      }),
      createOverlapMetricPanel('kv_ops', `KV Operations (ops)${titleSuffix}`, {
        expr: `sum by (job${instanceSumBySuffix}, bucket, op, result) (kv_ops{job=~"${snapshotIds}"${instanceFilter}})`,
        legendFormat: '{{job}}, {{instance}}, {{bucket}}, {{op}}, {{result}}',
        unit: 'short',
        width: '100%',
      }),
    ],
    "kv_ops",
    overlapEndTimeSeconds
  );
}
