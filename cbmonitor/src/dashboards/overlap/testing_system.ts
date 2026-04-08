import { EmbeddedScene } from "@grafana/scenes";
import { createOverlapMetricPanel } from "utils/utils.overlap";
import { createFlexLayout } from "utils/utils.panel";

export function systemTestingDashboard(snapshotIds: string, overlapEndTimeMs?: number): EmbeddedScene {
    return new EmbeddedScene({
        body: createFlexLayout({
            children:[
                createOverlapMetricPanel('sys_cpu_utilization_rate', 'CPU Utilization (%)', {
                    expr: `sum by (job, instance) (sys_cpu_utilization_rate{job=~"${snapshotIds}", instance="172.23.100.190"})`,
                    legendFormat: '{{job}}',
                    unit: 'percent',
                    width: '100%',
                }),

                createOverlapMetricPanel('sys_mem_free_sys', 'Free Memory (Bytes)', {
                    expr: `sum by (job, instance) (sys_mem_free_sys{job=~"${snapshotIds}"})`,
                    unit: 'bytes',
                }),

                createOverlapMetricPanel('sys_mem_used_sys', 'Used Memory (Bytes)', {
                    expr: `sum by (job, instance) (sys_mem_used_sys{job=~"${snapshotIds}"})`,
                    unit: 'bytes',
                }),

                createOverlapMetricPanel('sys_disk_queue', 'Disk Queue (Aggregate)', {
                    expr: `sum by (job, instance) (sys_disk_queue{job=~"${snapshotIds}"})`,
                    unit: 'short',
                }),

                createOverlapMetricPanel('couch_docs_actual_disk_size', 'Couch Docs Actual Disk Size (Bytes)', {
                    expr: `sum by (job, instance, bucket) (couch_docs_actual_disk_size{job=~"${snapshotIds}"})`,
                    unit: 'bytes',
                }),
            ],
        })
    });
}

