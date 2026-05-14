import { EmbeddedScene } from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';
import { createInstanceAwareScene } from 'utils/instanceScene';

// TODO: Revisit this dashboard to make it more useful.
export function clusterManagerMetricsDashboard(snapshotId: string): EmbeddedScene {
    // Base children without the per-instance HTTP Requests panels
    const buildBaseChildren = () => [
        // ns_server
        createMetricPanel('sysproc_cpu_seconds_total', 'ns_server CPU Usage (cores)', {
            expr: `sum by (instance) (rate(sysproc_cpu_seconds_total{job="${snapshotId}",proc="ns_server"}[$__rate_interval]))`,
            snapshotId,
            labelFilters: { proc: 'ns_server' },
            transformFunction: 'rate',
            unit: 'short',
        }),
        createMetricPanel('sysproc_mem_resident', 'ns_server Resident Memory (Bytes)', {
            expr: `sum by (instance) (sysproc_mem_resident{job="${snapshotId}",proc="ns_server"})`,
            snapshotId,
            labelFilters: { proc: 'ns_server' },
            unit: 'bytes',
        }),

        // Prometheus
        createMetricPanel('sysproc_cpu_seconds_total', 'Prometheus CPU Usage (cores)', {
            expr: `sum by (instance) (rate(sysproc_cpu_seconds_total{job="${snapshotId}",proc="prometheus"}[$__rate_interval]))`,
            snapshotId,
            labelFilters: { proc: 'prometheus' },
            transformFunction: 'rate',
            unit: 'short',
        }),
        createMetricPanel('sysproc_mem_resident', 'Prometheus Resident Memory (Bytes)', {
            expr: `sum by (instance) (sysproc_mem_resident{job="${snapshotId}",proc="prometheus"})`,
            snapshotId,
            labelFilters: { proc: 'prometheus' },
            unit: 'bytes',
        }),

        // Miscellaneous metrics
        createMetricPanel('sys_cpu_cores_available', 'CPU Cores Available', {
            expr: `sum by (instance) (sys_cpu_cores_available{job="${snapshotId}"})`,
            snapshotId,
            unit: 'short',
        }),
    ];

    return createInstanceAwareScene(
        snapshotId,
        'cm_http_requests_total',
        buildBaseChildren,
        (i: string) => [
            createMetricPanel('cm_http_requests_total', `HTTP Requests/Sec (${i})`, {
                expr: `sum by (method) (rate(cm_http_requests_total{job="${snapshotId}",instance="${i}"}[$__rate_interval]))`,
                legendFormat: '{{method}}',
                snapshotId,
                labelFilters: { instance: i },
                extraFields: ['d.labels.method'],
                transformFunction: 'rate',
                unit: 'short',
            }),
        ],
        () => [
            createMetricPanel('cm_http_requests_total', 'HTTP Requests/Sec', {
                expr: `rate(cm_http_requests_total{job="${snapshotId}"}[$__rate_interval])`,
                legendFormat: '{{method}} , {{instance}}',
                snapshotId,
                extraFields: ['d.labels.method', 'd.labels.instance'],
                transformFunction: 'rate',
                unit: 'short',
            }),
        ]
    );
}
