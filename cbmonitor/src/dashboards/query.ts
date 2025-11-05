import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';

export function queryMetricsDashboard(snapshotId: string): EmbeddedScene {
    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                createMetricPanel(snapshotId, 'n1ql_requests', 'Query Requests'),
                createMetricPanel(snapshotId, 'n1ql_selects', 'Query Selects'),
                createMetricPanel(snapshotId, 'n1ql_active_requests', 'Query Active Requests'),
                createMetricPanel(snapshotId, 'n1ql_requests_250ms', 'Query Requests > 250ms'),
                createMetricPanel(snapshotId, 'n1ql_requests_500ms', 'Query Requests > 500ms'),
                createMetricPanel(snapshotId, 'n1ql_requests_1000ms', 'Query Requests > 1000ms'),
                createMetricPanel(snapshotId, 'n1ql_errors', 'Query Errors'),
                createMetricPanel(snapshotId, 'n1ql_result_count', 'Query Result Count'),
                createMetricPanel(snapshotId, 'n1ql_service_time', 'Query Service Time'),
                createMetricPanel(snapshotId, 'n1ql_result_size', 'Query Result Size (Bytes)'),
                createMetricPanel(snapshotId, 'n1ql_invalid_requests', 'Query Invalid Requests'),
                createMetricPanel(snapshotId, 'n1ql_result_count', 'Query Result Count'),
                createMetricPanel(snapshotId, 'n1ql_service_time', 'Query Service Time'),
                createMetricPanel(snapshotId, 'n1ql_invalid_requests', 'Query Invalid Requests (Cumulative)'),
            ]
        })
    });
}
