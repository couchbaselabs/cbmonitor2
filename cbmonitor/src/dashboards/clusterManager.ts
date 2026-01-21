import { EmbeddedScene } from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';
import { createInstanceAwareScene } from 'utils/instanceScene';

// TODO: Revisit this dashboard to make it more useful.
export function clusterManagerMetricsDashboard(snapshotId: string): EmbeddedScene {
    // Base children without the per-instance HTTP Requests panels
    const buildBaseChildren = () => [
        // ns_server
        createMetricPanel(snapshotId, 'sysproc_cpu_seconds_total', 'ns_server CPU Time (Cumulative Seconds)', {
            labelFilters: { proc: 'ns_server' },
            unit: 's',
        }),
        createMetricPanel(snapshotId, 'sysproc_mem_resident', 'ns_server Resident Memory (Bytes)', {
            labelFilters: { proc: 'ns_server' },
            unit: 'bytes',
        }),

        // Prometheus
        createMetricPanel(snapshotId, 'sysproc_cpu_seconds_total', 'Prometheus CPU Time (Cumulative Seconds)', {
            labelFilters: { proc: 'prometheus' },
            unit: 's',
        }),
        createMetricPanel(snapshotId, 'sysproc_mem_resident', 'Prometheus Resident Memory (Bytes)', {
            labelFilters: { proc: 'prometheus' },
            unit: 'bytes',
        }),

        // Miscellaneous metrics
        createMetricPanel(snapshotId, 'scrape_duration_seconds', 'Scrape Duration (s)', {
            unit: 'ns',
        }),
        createMetricPanel(snapshotId, 'sys_cpu_cores_available', 'CPU Cores Available', {
            unit: 'short',
        }),
    ];

    return createInstanceAwareScene(
        snapshotId,
        'cm_http_requests_total',
        buildBaseChildren,
        (i: string) => [
            createMetricPanel(snapshotId, 'cm_http_requests_total', `HTTP Requests Total (${i})`, {
                labelFilters: { instance: i },
                extraFields: ['d.labels.method'],
                unit: 'short',
            }),
        ],
        () => [
            createMetricPanel(snapshotId, 'cm_http_requests_total', 'HTTP Requests Total', {
                extraFields: ['d.labels.method', 'd.labels.instance'],
                unit: 'short',
            }),
        ]
    );
}
