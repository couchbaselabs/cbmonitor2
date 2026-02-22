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
                createMetricPanel('sysproc_cpu_seconds_total', 'Query Engine CPU Time (Cumulative Seconds)', {
                    expr: `sum by (instance) (sysproc_cpu_seconds_total{job="${snapshotId}",proc="cbq-engine"})`,
                    legendFormat: '{{instance}} , {{mode}}',
                    snapshotId,
                    labelFilters: { proc: 'cbq-engine' },
                    extraFields: ['d.labels.`instance`', 'd.labels.`mode`'],
                    unit: 's'
                }),
                createMetricPanel('sysproc_mem_resident', 'Query Engine Resident Memory (Bytes)', {
                    expr: `sysproc_mem_resident{job="${snapshotId}",proc="cbq-engine"}`,
                    snapshotId,
                    labelFilters: { proc: 'cbq-engine' },
                    unit: 'bytes'
                }),
                createMetricPanel('n1ql_requests', 'Query Requests', {
                    expr: `n1ql_requests{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_selects', 'Query Selects', {
                    expr: `n1ql_selects{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_active_requests', 'Query Active Requests', {
                    expr: `n1ql_active_requests{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_requests_250ms', 'Query Requests > 250ms', {
                    expr: `n1ql_requests_250ms{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_requests_500ms', 'Query Requests > 500ms', {
                    expr: `n1ql_requests_500ms{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_requests_1000ms', 'Query Requests > 1000ms', {
                    expr: `n1ql_requests_1000ms{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_errors', 'Query Errors', {
                    expr: `n1ql_errors{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_result_count', 'Query Result Count', {
                    expr: `n1ql_result_count{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_result_size', 'Query Result Size (Bytes)', {
                    expr: `n1ql_result_size{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('n1ql_invalid_requests', 'Query Invalid Requests', {
                    expr: `n1ql_invalid_requests{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
            ]
        })
    });
}
