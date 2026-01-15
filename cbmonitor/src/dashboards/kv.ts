import { EmbeddedScene, SceneFlexLayout } from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';
import { getInstancesFromMetricRunner, parseInstancesFromFrames } from 'services/instanceService';

export function kvMetricsDashboard(snapshotId: string): EmbeddedScene {

    // Base panels (excluding the per-instance KV Ops panel which we add dynamically)
    const baseChildren = [
        // memcached
        createMetricPanel(snapshotId, 'sysproc_cpu_seconds_total', 'memcached CPU Time (Cumulative Seconds)', {
            labelFilters: { proc: 'memcached' },
            unit: 's',
        }),
        createMetricPanel(snapshotId, 'sysproc_mem_resident', 'memcached Resident Memory (Bytes)', {
            labelFilters: { proc: 'memcached' },
            unit: 'bytes',
        }),

        // Operations & Performance (keep GET ops aggregated for now)
        createMetricPanel(snapshotId, 'kv_vb_ops_get', 'vBucket GET Ops', {
            extraFields: ['d.labels.`instance`', 'd.labels.`bucket`'],
            unit: 'short',
        }),

        // Data & Items (what we're storing)
        createMetricPanel(snapshotId, 'kv_curr_items', 'Current Items Count', {
            unit: 'short',
        }),
        createMetricPanel(snapshotId, 'kv_curr_connections', 'Current Connections Count', {
            unit: 'short',
        }),

        // Memory Usage (resource consumption)
        createMetricPanel(snapshotId, 'kv_mem_used_bytes', 'KV Memory Usage (Bytes)', {
            unit: 'bytes',
        }),
        createMetricPanel(snapshotId, 'kv_ep_meta_data_memory_bytes', 'Metadata Memory Usage (Bytes)', {
            unit: 'bytes',
        }),

        // Disk Queue Metrics (persistence layer)
        createMetricPanel(snapshotId, 'kv_ep_diskqueue_fill', 'KV Engine Disk Queue Fill', {
            unit: 'short',
        }),
        createMetricPanel(snapshotId, 'kv_ep_diskqueue_drain', 'KV Engine Disk Queue Drain', {
            unit: 'short',
        }),

        // Queue Metrics (internal processing)
        createMetricPanel(snapshotId, 'kv_ep_queue_size', 'KV Engine Queue Size', {
            unit: 'short',
        }),
        createMetricPanel(snapshotId, 'kv_vb_queue_size', 'vBucket Queue Size', {
            unit: 'short',
        }),
        createMetricPanel(snapshotId, 'kv_vb_queue_age_seconds', 'vBucket Queue Age (Seconds)', {
            unit: 's',
        }),
    ];

    const layout = new SceneFlexLayout({
        minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
        direction: 'row',
        wrap: 'wrap',
        children: [...baseChildren],
    });

    // Build per-instance KV Ops panels
    const instancesRunner = getInstancesFromMetricRunner(snapshotId, 'kv_ops');
    layout.setState({ $data: instancesRunner });
    (instancesRunner as any).run?.();

    instancesRunner.subscribeToState((state: any) => {
        const frames = state?.data?.series ?? [];
        const instances = parseInstancesFromFrames(frames);

        let perInstancePanels = [] as ReturnType<typeof createMetricPanel>[];
        if (instances && instances.length > 0) {
            for (const i of instances) {
                perInstancePanels.push(
                    createMetricPanel(snapshotId, 'kv_ops', `KV Operations (ops) (${i})`, {
                        labelFilters: { instance: i },
                        extraFields: ['d.labels.`op`', 'd.labels.`result`', 'd.labels.`bucket`'],
                        unit: 'short',
                        width: '49%',
                    })
                );
            }
        } else {
            // Fallback: aggregated KV Ops across instances
            perInstancePanels = [
                createMetricPanel(snapshotId, 'kv_ops', 'KV Operations (ops)', {
                    extraFields: ['d.labels.`instance`', 'd.labels.`op`', 'd.labels.`result`', 'd.labels.`bucket`'],
                    unit: 'short',
                    width: '100%',
                }),
            ];
        }

        layout.setState({ children: [...baseChildren, ...perInstancePanels] });
    });

    return new EmbeddedScene({
        body: layout,
    });
}
