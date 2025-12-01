import { EmbeddedScene, SceneFlexLayout } from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';
import { parseInstancesFromFrames, getInstancesFromMetricRunner } from 'services/instanceService';

// TODO: Revisit this dashboard to make it more useful.
export function clusterManagerMetricsDashboard(snapshotId: string): EmbeddedScene {
    // Base children without the per-instance HTTP Requests panels
    const baseChildren = [
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

    const layout = new SceneFlexLayout({
        minHeight: 50, // Intentional to allow the layout to be visible when no data is available
        direction: 'row',
        wrap: 'wrap',
        children: [
            ...baseChildren,
            // Initial placeholder: can show none until instances resolve
        ],
    });

    // Dynamically load distinct instances and append per-instance HTTP Requests panels
    // Prefer deriving instances directly from the target metric frames
    const instancesRunner = getInstancesFromMetricRunner(snapshotId, 'cm_http_requests_total');
    // Attach runner directly so table-like query isn't transformed away
    layout.setState({ $data: instancesRunner });
    // Explicitly trigger execution
    (instancesRunner as any).run?.();
    instancesRunner.subscribeToState((state: any) => {
        const frames = state?.data?.series ?? [];
        const instances = parseInstancesFromFrames(frames);
        let perInstancePanels = [] as ReturnType<typeof createMetricPanel>[];
        if (instances && instances.length > 0) {
            for (const i of instances) {
                perInstancePanels.push(
                    createMetricPanel(snapshotId, 'cm_http_requests_total', `HTTP Requests Total (${i})`, {
                        labelFilters: { instance: i },
                        extraFields: ['d.labels.method'],
                        unit: 'short',
                        width: '49%',
                    })
                );
            }
        } else {
            // Fallback: show a single aggregated panel if instances not resolved
            perInstancePanels = [
                createMetricPanel(snapshotId, 'cm_http_requests_total', 'HTTP Requests Total', {
                    extraFields: ['d.labels.method', 'd.labels.instance'],
                    unit: 'short',
                    width: '100%',
                }),
            ];
        }

        layout.setState({
            children: [...baseChildren, ...perInstancePanels],
        });
    });

    return new EmbeddedScene({
        body: layout,
    });
}
