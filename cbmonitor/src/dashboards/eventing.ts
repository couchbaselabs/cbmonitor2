import { EmbeddedScene } from '@grafana/scenes';
import { createMetricPanel, createFlexLayout } from 'utils/utils.panel';

// TODO: Revisit this dashboard to make it more useful.
export function eventingMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: createFlexLayout({
            minHeight: 50,
            direction: 'row',
            wrap: 'wrap',
            children: [
                // Eventing
                // mara here: couldnt find the label eventing, did find eventing-produc though 
                createMetricPanel('sysproc_cpu_seconds_total', 'Eventing CPU Time (Cumulative Seconds)', {
                    expr: `sum by (instance) (sysproc_cpu_seconds_total{job="${snapshotId}",proc="eventing-produc"})`,
                    snapshotId,
                    labelFilters: { proc: 'eventing-produc' },
                    extraFields: ['d.labels.`instance`', 'd.labels.`mode`'],
                    unit: 's'
                }),
                createMetricPanel('sysproc_mem_resident', 'Eventing Resident Memory (Bytes)', {
                    expr: `sum by (instance) (sysproc_mem_resident{job="${snapshotId}",proc="eventing-produc"})`,
                    snapshotId,
                    labelFilters: { proc: 'eventing-produc' },
                    unit: 'bytes'
                }),
                createMetricPanel('eventing_worker_restart_count', 'Worker Restart Count', {
                    expr: `sum by (instance) (eventing_worker_restart_count{job="${snapshotId}"})`,
                    snapshotId,
                    extraFields: ['d.labels.instance'],
                    width: '100%',
                    unit: 'short'
                }),
            ],
        })
    });
}
