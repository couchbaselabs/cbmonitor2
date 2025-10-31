import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { getSnapshotPanel } from 'utils/utils.panel';

export function clusterManagerMetricsDashboard(snapshotId: string): EmbeddedScene {
    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                getSnapshotPanel(snapshotId, 'cm_http_requests_total', 'HTTP Requests Total'),
            ],
        })
    });
}
