import { EmbeddedScene, SceneFlexLayout } from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';
import { getInstancesFromMetricRunner, parseInstancesFromFrames } from 'services/instanceService';

// TO DO: add a way to select which indexes you want to compare
// TO DO: add a way to select which indexes you want to compare
export function indexMetricsDashboard(snapshotId: string): EmbeddedScene {
    const baseChildren = [
        // Indexer
        createMetricPanel(snapshotId, 'sysproc_cpu_seconds_total', 'Indexer CPU Time (Cumulative Seconds)', {
            labelFilters: { proc: 'indexer' },
            unit: 's',
        }),
        createMetricPanel(snapshotId, 'sysproc_mem_resident', 'Indexer Resident Memory (Bytes)', {
            labelFilters: { proc: 'indexer' },
            unit: 'bytes',
        }),
        // Latency and throughput metrics
        createMetricPanel(snapshotId, 'index_avg_disk_bps', 'Index Disk Bytes per Second', {
            unit: 'binBps',
        }),
        createMetricPanel(snapshotId, 'index_avg_mutation_rate', 'Index Mutation Rate', {
            unit: 'ops',
        }),
        createMetricPanel(snapshotId, 'index_net_avg_scan_rate', 'Index Average Scan Rate', {
            unit: 'ops',
        }),
        createMetricPanel(snapshotId, 'index_memory_rss', 'Indexer Process Resident Set Size', {
            unit: 'bytes',
        }),
        createMetricPanel(snapshotId, 'index_memory_used', 'Index Memory Used', {
            unit: 'bytes',
        }),
        createMetricPanel(snapshotId, 'index_total_data_size', 'Index Total Data Size', {
            unit: 'bytes',
        }),
    ];

    const layout = new SceneFlexLayout({
        minHeight: 50,
        direction: 'row',
        wrap: 'wrap',
        children: [...baseChildren],
    });

    // Derive instances directly from a representative per-index metric
    const instancesRunner = getInstancesFromMetricRunner(snapshotId, 'index_avg_scan_latency');
    layout.setState({ $data: instancesRunner });
    (instancesRunner as any).run?.();

    instancesRunner.subscribeToState((state: any) => {
        const frames = state?.data?.series ?? [];
        const instances = parseInstancesFromFrames(frames);

        let perInstancePanels = [] as ReturnType<typeof createMetricPanel>[];
        if (instances && instances.length > 0) {
            for (const i of instances) {
                // Per-index metrics repeated per instance; series split by bucket/index
                perInstancePanels.push(
                    createMetricPanel(snapshotId, 'index_avg_scan_latency', `Index Avg Scan Latency (${i})`, {
                        labelFilters: { instance: i },
                        extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                        unit: 'ns',
                        width: '50%%',
                    })
                );
                perInstancePanels.push(
                    createMetricPanel(snapshotId, 'index_cache_hits', `Index Cache Hits (${i})`, {
                        labelFilters: { instance: i },
                        extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                        unit: 'short',
                        width: '50%%',
                    })
                );
                perInstancePanels.push(
                    createMetricPanel(snapshotId, 'index_cache_misses', `Index Cache Misses (${i})`, {
                        labelFilters: { instance: i },
                        extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                        unit: 'short',
                        width: '50%%',
                    })
                );
                perInstancePanels.push(
                    createMetricPanel(snapshotId, 'index_num_requests', `Index Number of Requests (${i})`, {
                        labelFilters: { instance: i },
                        extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                        unit: 'short',
                        width: '50%%',
                    })
                );
                perInstancePanels.push(
                    createMetricPanel(snapshotId, 'index_num_rows_returned', `Index Number of Rows Returned (${i})`, {
                        labelFilters: { instance: i },
                        extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                        unit: 'short',
                        width: '50%%',
                    })
                );
                perInstancePanels.push(
                    createMetricPanel(snapshotId, 'index_num_docs_indexed', `Index Number of Documents Indexed (${i})`, {
                        labelFilters: { instance: i },
                        extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                        unit: 'short',
                        width: '50%%',
                    })
                );
                perInstancePanels.push(
                    createMetricPanel(snapshotId, 'index_items_count', `Index Items Count (${i})`, {
                        labelFilters: { instance: i },
                        extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                        unit: 'short',
                        width: '50%%',
                    })
                );
                perInstancePanels.push(
                    createMetricPanel(snapshotId, 'index_disk_size', `Index Disk Size (${i})`, {
                        labelFilters: { instance: i },
                        extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                        unit: 'bytes',
                        width: '50%%',
                    })
                );
                perInstancePanels.push(
                    createMetricPanel(snapshotId, 'index_avg_item_size', `Index Average Item Size (${i})`, {
                        labelFilters: { instance: i },
                        extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                        unit: 'bytes',
                        width: '50%%',
                    })
                );
            }
        } else {
            // Fallback: aggregated per-index panels (all instances)
            perInstancePanels = [
                createMetricPanel(snapshotId, 'index_avg_scan_latency', 'Index Average Scan Latency', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'ns',
                    width: '100%',
                }),
                createMetricPanel(snapshotId, 'index_cache_hits', 'Index Cache Hits', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'short',
                    width: '100%',
                }),
                createMetricPanel(snapshotId, 'index_cache_misses', 'Index Cache Misses', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'short',
                    width: '100%',
                }),
                createMetricPanel(snapshotId, 'index_num_requests', 'Index Number of Requests', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'short',
                    width: '100%',
                }),
                createMetricPanel(snapshotId, 'index_num_rows_returned', 'Index Number of Rows Returned', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'short',
                    width: '100%',
                }),
                createMetricPanel(snapshotId, 'index_num_docs_indexed', 'Index Number of Documents Indexed', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'short',
                    width: '100%',
                }),
                createMetricPanel(snapshotId, 'index_items_count', 'Index Items Count', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'short',
                    width: '100%',
                }),
                createMetricPanel(snapshotId, 'index_disk_size', 'Index Disk Size', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'bytes',
                    width: '100%',
                }),
                createMetricPanel(snapshotId, 'index_avg_item_size', 'Index Average Item Size', {
                    extraFields: ['d.labels.`bucket`', 'd.labels.`index`'],
                    unit: 'bytes',
                    width: '100%',
                }),
            ];
        }

        layout.setState({ children: [...baseChildren, ...perInstancePanels] });
    });

    return new EmbeddedScene({ body: layout });
}
