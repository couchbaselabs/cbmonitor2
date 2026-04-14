import { EmbeddedScene } from "@grafana/scenes";
import { createInstanceAwareOverlapScene } from "utils/instanceScene";

export function systemOverlapMetricsDashboard(snapshotIds: string, overlapEndTimeSeconds?: number): EmbeddedScene {
    return createInstanceAwareOverlapScene(snapshotIds, ({ instanceFilter, titleSuffix, instanceSumBySuffix, createOverlapMetricPanel }) => {

        return [
            createOverlapMetricPanel('sys_cpu_utilization_rate', `CPU Utilization (%)${titleSuffix}`, {
                expr: `sum by (job${instanceSumBySuffix}) (sys_cpu_utilization_rate{job=~"${snapshotIds}"${instanceFilter}})`,
                legendFormat: '{{job}}, {{instance}}',
                unit: 'percent',
                width: '100%',
            }),

            createOverlapMetricPanel('sys_mem_free_sys', `Free Memory (Bytes)${titleSuffix}`, {
                expr: `sum by (job${instanceSumBySuffix}) (sys_mem_free_sys{job=~"${snapshotIds}"${instanceFilter}})`,
                legendFormat: '{{job}}, {{instance}}',
                unit: 'bytes',
            }),

            createOverlapMetricPanel('sys_mem_used_sys', `Used Memory (Bytes)${titleSuffix}`, {
                expr: `sum by (job${instanceSumBySuffix}) (sys_mem_used_sys{job=~"${snapshotIds}"${instanceFilter}})`,
                legendFormat: '{{job}}, {{instance}}',
                unit: 'bytes',
            }),

            createOverlapMetricPanel('sys_disk_queue', `Disk Queue (Aggregate)${titleSuffix}`, {
                expr: `sum by (job${instanceSumBySuffix}) (sys_disk_queue{job=~"${snapshotIds}"${instanceFilter}})`,
                legendFormat: '{{job}}, {{instance}}',
                unit: 'short',
            }),

            createOverlapMetricPanel('couch_docs_actual_disk_size', `Couch Docs Actual Disk Size (Bytes)${titleSuffix}`, {
                expr: `sum by (job${instanceSumBySuffix}, bucket) (couch_docs_actual_disk_size{job=~"${snapshotIds}"${instanceFilter}})`,
                legendFormat: '{{job}}, {{instance}}, {{bucket}}',
                unit: 'bytes',
            }),

            createOverlapMetricPanel('sys_disk_read_bytes', `Rate Disk Read Bytes${titleSuffix}`, {
                expr: `sum by (job${instanceSumBySuffix}) (rate(sys_disk_read_bytes{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
                legendFormat: '{{job}}, {{instance}}',
                unit: 'Bps',
            }),

            createOverlapMetricPanel('sys_disk_write_bytes', `Rate Disk Write Bytes${titleSuffix}`, {
                expr: `sum by (job${instanceSumBySuffix}) (rate(sys_disk_write_bytes{job=~"${snapshotIds}"${instanceFilter}}[$__rate_interval]))`,
                legendFormat: '{{job}}, {{instance}}',
                unit: 'Bps',
            }),
        ];
    }, { overlapEndTimeSeconds });
}

