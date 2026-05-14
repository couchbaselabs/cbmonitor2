import { EmbeddedScene } from '@grafana/scenes';
import { createMetricPanel, createFlexLayout } from 'utils/utils.panel';

export function queryMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: createFlexLayout({
            children: [
                // Query Engine
                createMetricPanel('sysproc_cpu_seconds_total', 'Query Engine CPU Usage (cores)', {
                    expr: `sum by (instance) (rate(sysproc_cpu_seconds_total{job="${snapshotId}",proc="cbq-engine"}[$__rate_interval]))`,
                    legendFormat: '{{instance}}',
                    snapshotId,
                    labelFilters: { proc: 'cbq-engine' },
                    extraFields: ['d.labels.`instance`', 'd.labels.`mode`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sysproc_mem_resident', 'Query Engine Resident Memory (Bytes)', {
                    expr: `sum by (instance) (sysproc_mem_resident{job="${snapshotId}",proc="cbq-engine"})`,
                    snapshotId,
                    labelFilters: { proc: 'cbq-engine' },
                    unit: 'bytes'
                }),
                createMetricPanel('n1ql_requests', 'Query Requests', {
                    expr: `sum by (instance) (n1ql_requests{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_selects', 'Query Selects', {
                    expr: `sum by (instance) (n1ql_selects{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_active_requests', 'Query Active Requests', {
                    expr: `sum by (instance) (n1ql_active_requests{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_requests_250ms', 'Query Requests > 250ms', {
                    expr: `sum by (instance) (n1ql_requests_250ms{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_requests_500ms', 'Query Requests > 500ms', {
                    expr: `sum by (instance) (n1ql_requests_500ms{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_requests_1000ms', 'Query Requests > 1000ms', {
                    expr: `sum by (instance) (n1ql_requests_1000ms{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_errors', 'Query Errors', {
                    expr: `sum by (instance) (n1ql_errors{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_result_count', 'Query Result Count', {
                    expr: `sum by (instance) (n1ql_result_count{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('n1ql_result_size', 'Query Result Size (Bytes)', {
                    expr: `sum by (instance) (n1ql_result_size{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('n1ql_invalid_requests', 'Query Invalid Requests', {
                    expr: `sum by (instance) (n1ql_invalid_requests{job="${snapshotId}"})`,
                    snapshotId,
                    unit: 'short'
                }),

                // Request-time tail latency. Server exports these as  pre-computed gauges (ns), so we plot them directly
                createMetricPanel('n1ql_request_timer_percentiles', 'Query Request Time — p50 / p95 / p99', {
                    expr: `
                      label_replace(sum by (instance) (n1ql_request_timer_median{job="${snapshotId}"}), "quantile", "p50", "", "")
                      or label_replace(sum by (instance) (n1ql_request_timer_p95{job="${snapshotId}"}),  "quantile", "p95", "", "")
                      or label_replace(sum by (instance) (n1ql_request_timer_p99{job="${snapshotId}"}),  "quantile", "p99", "", "")
                    `.trim(),
                    legendFormat: '{{instance}} , {{quantile}}',
                    snapshotId,
                    extraFields: ['d.labels.`instance`', 'd.labels.`quantile`'],
                    unit: 'ns',
                }),

                // Mean / max for outlier context alongside the percentile panel. Same overlay pattern.
                createMetricPanel('n1ql_request_timer_mean_max', 'Query Request Time — mean / max', {
                    expr: `
                      label_replace(sum by (instance) (n1ql_request_timer_mean{job="${snapshotId}"}), "stat", "mean", "", "")
                      or label_replace(sum by (instance) (n1ql_request_timer_max{job="${snapshotId}"}),  "stat", "max",  "", "")
                    `.trim(),
                    legendFormat: '{{instance}} , {{stat}}',
                    snapshotId,
                    extraFields: ['d.labels.`instance`', 'd.labels.`stat`'],
                    unit: 'ns',
                }),
            ]
        })
    });
}
