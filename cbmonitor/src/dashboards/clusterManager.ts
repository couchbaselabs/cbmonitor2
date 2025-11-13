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
                // ns_server
                createMetricPanel(snapshotId, 'sysproc_cpu_utilization', 'ns_server CPU Utilization (%)', {
                    labelFilters: { proc: 'ns_server' },
                    unit: 'percent'
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'ns_server Resident Memory (Bytes)', {
                    labelFilters: { proc: 'ns_server' },
                    unit: 'bytes'
                }),

                 // Prometheus
                createMetricPanel(snapshotId, 'sysproc_cpu_utilization', 'Prometheus CPU Utilization (%)', {
                    labelFilters: { proc: 'prometheus' },
                    unit: 'percent'
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'Prometheus Resident Memory (Bytes)', {
                    labelFilters: { proc: 'prometheus' },
                    unit: 'bytes'
                }),
    
                // Miscellaneous metrics
                createMetricPanel(snapshotId, 'scrape_duration_seconds', 'Scrape Duration (s)', {
                    unit: 'ns'
                }),
                createMetricPanel(snapshotId, 'sys_cpu_cores_available', 'CPU Cores Available', {
                    unit: 'short'
                }),
                createMetricPanel(snapshotId, 'cm_http_requests_total', 'HTTP Requests Total', {
                    extraFields: ['d.labels.instance', 'd.labels.method'],
                    labelFilters: {
                        method: ['GET', 'POST', 'PUT', 'DELETE', 'RPCCONNECT'],
                    },
                    width: '100%',
                    unit: 'short'
                }),
            ],
        })
    });
}
