import { EmbeddedScene } from "@grafana/scenes";
import { createOverlapMetricPanel } from "utils/utils.panelOverlap";
import { createInstanceAwareOverlapScene } from "utils/instanceScene";

export function systemTestingDashboard(snapshotIds: string): EmbeddedScene {
    return createInstanceAwareOverlapScene(
        snapshotIds,
        (i: string) => [
                createOverlapMetricPanel('sys_cpu_utilization_rate', `CPU Utilization (%) - ${i}`, {
                    expr: `sum by (job, instance) (sys_cpu_utilization_rate{job=~"${snapshotIds}", instance="${i}"})`,
                    legendFormat: '{{job}}, {{instance}}',
                    unit: 'percent',
                    width: '100%',
                }),

                createOverlapMetricPanel('sys_mem_free_sys', `Free Memory (Bytes) - ${i}`, {
                    expr: `sum by (job, instance) (sys_mem_free_sys{job=~"${snapshotIds}", instance="${i}"})`,
                    legendFormat: '{{job}}, {{instance}}',
                    unit: 'bytes',
                }),

                createOverlapMetricPanel('sys_mem_used_sys', `Used Memory (Bytes) - ${i}`, {
                    expr: `sum by (job, instance) (sys_mem_used_sys{job=~"${snapshotIds}", instance="${i}"})`,
                    legendFormat: '{{job}}, {{instance}}',
                    unit: 'bytes',
                }),

                createOverlapMetricPanel('sys_disk_queue', `Disk Queue (Aggregate) - ${i}`, {
                    expr: `sum by (job, instance) (sys_disk_queue{job=~"${snapshotIds}", instance="${i}"})`,
                    legendFormat: '{{job}}, {{instance}}',
                    unit: 'short',
                }),

                createOverlapMetricPanel('couch_docs_actual_disk_size', `Couch Docs Actual Disk Size (Bytes) - ${i}`, {
                    expr: `sum by (job, instance, bucket) (couch_docs_actual_disk_size{job=~"${snapshotIds}", instance="${i}"})`,
                    legendFormat: '{{job}}, {{instance}}, {{bucket}}',
                    unit: 'bytes',
                }),

                createOverlapMetricPanel('sys_disk_read_bytes', `Rate Disk Read Bytes - ${i}`, {
                    expr: `sum by (job, instance) (rate(sys_disk_read_bytes{job=~"${snapshotIds}", instance="${i}"}[$__rate_interval]))`,
                    legendFormat: '{{job}}, {{instance}}',
                    unit: 'Bps',
                }),

                createOverlapMetricPanel('sys_disk_write_bytes', `Rate Disk Write Bytes - ${i}`, {
                    expr: `sum by (job, instance) (rate(sys_disk_write_bytes{job=~"${snapshotIds}", instance="${i}"}[$__rate_interval]))`,
                    legendFormat: '{{job}}, {{instance}}',
                    unit: 'Bps',
                }),
            ],

        () => [
            createOverlapMetricPanel('sys_cpu_utilization_rate', 'CPU Utilization (%)', {
                    expr: `sum by (job, instance) (sys_cpu_utilization_rate{job=~"${snapshotIds}"})`,
                    legendFormat: '{{job}}, {{instance}}',
                    unit: 'percent',
                    width: '100%',
                }),

                createOverlapMetricPanel('sys_mem_free_sys', 'Free Memory (Bytes)', {
                    expr: `sum by (job, instance) (sys_mem_free_sys{job=~"${snapshotIds}"})`,
                    legendFormat: '{{job}}, {{instance}}',
                    unit: 'bytes',
                }),

                createOverlapMetricPanel('sys_mem_used_sys', 'Used Memory (Bytes)', {
                    expr: `sum by (job, instance) (sys_mem_used_sys{job=~"${snapshotIds}"})`,
                    legendFormat: '{{job}}, {{instance}}',
                    unit: 'bytes',
                }),

                createOverlapMetricPanel('sys_disk_queue', 'Disk Queue (Aggregate)', {
                    expr: `sum by (job, instance) (sys_disk_queue{job=~"${snapshotIds}"})`,
                    legendFormat: '{{job}}, {{instance}}',
                    unit: 'short',
                }),

                createOverlapMetricPanel('couch_docs_actual_disk_size', 'Couch Docs Actual Disk Size (Bytes)', {
                    expr: `sum by (job, instance, bucket) (couch_docs_actual_disk_size{job=~"${snapshotIds}"})`,
                    legendFormat: '{{job}}, {{instance}}, {{bucket}}',
                    unit: 'bytes',
                }),

                createOverlapMetricPanel('sys_disk_read_bytes', 'Rate Disk Read Bytes', {
                     expr: `sum by (job, instance) (rate(sys_disk_read_bytes{job=~"${snapshotIds}"}[$__rate_interval]))`,
                    legendFormat: '{{job}}, {{instance}}',
                    unit: 'Bps',
                }),

                createOverlapMetricPanel('sys_disk_write_bytes', 'Rate Disk Write Bytes', {
                    expr: `sum by (job, instance) (rate(sys_disk_write_bytes{job=~"${snapshotIds}"}[$__rate_interval]))`,
                    legendFormat: '{{job}}, {{instance}}',
                    unit: 'Bps',
                }),
        ]
    );
}

