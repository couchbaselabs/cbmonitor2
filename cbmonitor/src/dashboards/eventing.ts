import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';

// TODO: Revisit this dashboard to make it more useful.
export function eventingMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                // Eventing
                // mara here: couldnt find the label eventing, did find eventing-produc though 
                createMetricPanel(snapshotId, 'sysproc_cpu_seconds_total', 'Eventing CPU Time (Cumulative Seconds)', {
                    labelFilters: { proc: 'eventing-produc' },
                    unit: 's'
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'Eventing Resident Memory (Bytes)', {
                    labelFilters: { proc: 'eventing-produc' },
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'eventing_worker_restart_count', 'Worker Restart Count', {
                    extraFields: ['d.labels.instance'],
                    width: '100%',
                    unit: 'short'
                }),
            ],
        })
    });
}
