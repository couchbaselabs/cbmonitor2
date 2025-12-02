import { EmbeddedScene, SceneFlexLayout } from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';
import { getInstancesFromMetricRunner, parseInstancesFromFrames } from 'services/instanceService';

export function systemMetricsDashboard(snapshotId: string): EmbeddedScene {
    const baseChildren = [
        // Per-service CPU and Memory utilisation
        // TODO: Add a logic to only show the panels for the services that are actually present in the snapshot.
        // Overall (per node) CPU and Memory utilisation
        createMetricPanel(snapshotId, 'sys_cpu_utilization_rate', 'CPU Utilization (%)', {
            unit: 'percent',
        }),
        createMetricPanel(snapshotId, 'sys_mem_free_sys', 'Free Memory (Bytes)', {
            unit: 'bytes',
        }),
        createMetricPanel(snapshotId, 'sys_mem_used_sys', 'Used Memory (Bytes)', {
            unit: 'bytes',
        }),
        // Overall Disk utilisation
        createMetricPanel(snapshotId, 'sys_disk_queue', 'Disk Queue (Aggregate)', {
            unit: 'short',
        }),
        createMetricPanel(snapshotId, 'couch_docs_actual_disk_size', 'Couch Docs Actual Disk Size (Bytes)', {
            extraFields: ['d.labels.`bucket`', 'd.labels.`instance`'],
            unit: 'bytes',
        }),
    ];

    const layout = new SceneFlexLayout({
        minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
        direction: 'row',
        wrap: 'wrap',
        children: [...baseChildren],
    });

    // Derive instances directly from disk read metric frames
    const instancesRunner = getInstancesFromMetricRunner(snapshotId, 'sys_disk_read_bytes');
    layout.setState({ $data: instancesRunner });
    (instancesRunner as any).run?.();

    instancesRunner.subscribeToState((state: any) => {
        const frames = state?.data?.series ?? [];
        const instances = parseInstancesFromFrames(frames);

        let perInstancePanels = [] as ReturnType<typeof createMetricPanel>[];
        if (instances && instances.length > 0) {
            for (const i of instances) {
                // Read bytes per instance (series by disk)
                perInstancePanels.push(
                    createMetricPanel(snapshotId, 'sys_disk_read_bytes', `Disk Read Bytes (${i})`, {
                        labelFilters: { instance: i },
                        extraFields: ['d.labels.`disk`'],
                        unit: 'short',
                        width: '49%',
                        displayNameTemplate: '${__series.labels.disk}',
                    })
                );
                // Write bytes per instance (series by disk)
                perInstancePanels.push(
                    createMetricPanel(snapshotId, 'sys_disk_write_bytes', `Disk Write Bytes (${i})`, {
                        labelFilters: { instance: i },
                        extraFields: ['d.labels.`disk`'],
                        unit: 'short',
                        width: '49%',
                        displayNameTemplate: '${__series.labels.disk}',
                    })
                );
            }
        } else {
            // Fallback aggregated panels (series by disk, all instances)
            perInstancePanels = [
                createMetricPanel(snapshotId, 'sys_disk_read_bytes', 'Disk Read Bytes', {
                    extraFields: ['d.labels.`disk`'],
                    unit: 'short',
                    width: '100%',
                    displayNameTemplate: '${__series.labels.disk}',
                }),
                createMetricPanel(snapshotId, 'sys_disk_write_bytes', 'Disk Write Bytes', {
                    extraFields: ['d.labels.`disk`'],
                    unit: 'short',
                    width: '100%',
                    displayNameTemplate: '${__series.labels.disk}',
                }),
            ];
        }

        layout.setState({ children: [...baseChildren, ...perInstancePanels] });
    });

    return new EmbeddedScene({ body: layout });
}
