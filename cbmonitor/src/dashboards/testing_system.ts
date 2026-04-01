import { EmbeddedScene, SceneTimeRange } from "@grafana/scenes";
import { createOverlapMetricPanel } from "utils/utils.overlap";
import { createFlexLayout } from "utils/utils.panel";

export function systemTestingDashboard(snapshotId: string, globalTimeRange: SceneTimeRange): EmbeddedScene {
    return new EmbeddedScene({
        body: createFlexLayout({
            children:[
                // 2. SWAP to createOverlapMetricPanel and pass globalTimeRange
                createOverlapMetricPanel('sys_cpu_utilization_rate', 'CPU Utilization (%)', {
                    expr: `sum by (job, instance) (sys_cpu_utilization_rate{job=~"${snapshotId}"})`,
                    unit: 'percent',
                    width: '100%'
                }, globalTimeRange), // <--- Passing the global time here!

                createOverlapMetricPanel('sys_mem_free_sys', 'Free Memory (Bytes)', {
                    expr: `sum by (job, instance) (sys_mem_free_sys{job=~"${snapshotId}"})`,
                    unit: 'bytes',
                }, globalTimeRange),

                createOverlapMetricPanel('sys_mem_used_sys', 'Used Memory (Bytes)', {
                    expr: `sum by (job, instance) (sys_mem_used_sys{job=~"${snapshotId}"})`,
                    unit: 'bytes',
                }, globalTimeRange),

                createOverlapMetricPanel('sys_disk_queue', 'Disk Queue (Aggregate)', {
                    expr: `sum by (job, instance) (sys_disk_queue{job=~"${snapshotId}"})`,
                    unit: 'short',
                }, globalTimeRange),

                createOverlapMetricPanel('couch_docs_actual_disk_size', 'Couch Docs Actual Disk Size (Bytes)', {
                    expr: `sum by (job, instance, bucket) (couch_docs_actual_disk_size{job=~"${snapshotId}"})`,
                    unit: 'bytes',
                }, globalTimeRange),
            ],
        })
    });
}