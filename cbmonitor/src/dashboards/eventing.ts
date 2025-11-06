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
                createMetricPanel(snapshotId, 'eventing_worker_restart_count', 'Worker Restart Count', {
                    extraFields: ['d.labels.instance'],
                    width: '100%'
                }),
            ],
        })
    });
}
