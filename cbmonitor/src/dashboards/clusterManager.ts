import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';

// TODO: Revisit this dashboard to make it more useful.
export function clusterManagerMetricsDashboard(snapshotId: string): EmbeddedScene {
    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                createMetricPanel(snapshotId, 'cm_http_requests_total', 'HTTP Requests Total', {
                    extraFields: ['d.labels.instance', 'd.labels.method'],
                    labelFilters: {
                        method: ['GET', 'POST', 'PUT', 'DELETE', 'RPCCONNECT'],
                    },
                    width: '100%',
                }),
            ],
        })
    });
}
