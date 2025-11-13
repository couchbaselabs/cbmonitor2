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
                // Query Engine
                createMetricPanel(snapshotId, 'sysproc_cpu_utilization', 'Query Engine CPU Utilization (%)', {
                    labelFilters: { proc: 'cbq-engine' },
                    unit: 'percent'
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'Query Engine Resident Memory (Bytes)', {
                    labelFilters: { proc: 'cbq-engine' },
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'n1ql_requests', 'Query Requests',{
                    unit: 'ops'
                }),
                createMetricPanel(snapshotId, 'n1ql_selects', 'Query Selects', {
                    unit: 'ops'
                }),
                createMetricPanel(snapshotId, 'n1ql_active_requests', 'Query Active Requests', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'n1ql_requests_250ms', 'Query Requests > 250ms', {
                    unit: 'ops'
                }),
                createMetricPanel(snapshotId, 'n1ql_requests_500ms', 'Query Requests > 500ms', {
                    unit: 'ops'
                }),
                createMetricPanel(snapshotId, 'n1ql_requests_1000ms', 'Query Requests > 1000ms', {
                    unit: 'ops'
                }),
                createMetricPanel(snapshotId, 'n1ql_errors', 'Query Errors', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'n1ql_result_count', 'Query Result Count', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'n1ql_service_time', 'Query Service Time', {
                    unit: 'ms'
                }),
                createMetricPanel(snapshotId, 'n1ql_result_size', 'Query Result Size (Bytes)', {
                    unit: 'bytes'
                }),
                createMetricPanel(snapshotId, 'n1ql_invalid_requests', 'Query Invalid Requests', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'n1ql_result_count', 'Query Result Count', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'n1ql_service_time', 'Query Service Time', {
                    unit: 'ms'
                }),
            ]
        })
    });
}
