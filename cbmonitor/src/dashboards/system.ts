import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';

export function systemMetricsDashboard(snapshotId: string): EmbeddedScene {
    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                // Per-service CPU and Memory utilisation
                // TODO: Add a logic to only show the panels for the services that are actually present in the snapshot.
                // Overall (per node) CPU and Memory utilisation
                createMetricPanel(snapshotId, 'sys_cpu_utilization_rate', 'CPU Utilization (%)'),
                createMetricPanel(snapshotId, 'sys_mem_free', 'Free Memory (Bytes)'),
                //createMetricPanel(snapshotId, 'sys_cpu_cores_available', 'CPU Cores Available'),
                
                // ns_server
                createMetricPanel(snapshotId, 'sysproc_cpu_utilization', 'ns_server CPU Utilization (%)', {
                    labelFilters: {
                        proc: 'ns_server',
                    },
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'ns_server Resident Memory (Bytes)', {
                    labelFilters: {
                        proc: 'ns_server',
                    },
                }),
                // memcached
                createMetricPanel(snapshotId, 'sysproc_cpu_utilization', 'memcached CPU Utilization (%)', {
                    labelFilters: {
                        proc: 'memcached',
                    },
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'memcached Resident Memory (Bytes)', {
                    labelFilters: {
                        proc: 'memcached',
                    },
                }),
                // Query Engine
                createMetricPanel(snapshotId, 'sysproc_cpu_utilization', 'Query Engine CPU Utilization (%)', {
                    labelFilters: {
                        proc: 'cbq-engine',
                    },
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'Query Engine Resident Memory (Bytes)', {
                    labelFilters: {
                        proc: 'cbq-engine',
                    },
                }),
                // Indexer
                createMetricPanel(snapshotId, 'sysproc_cpu_utilization', 'Indexer CPU Utilization (%)', {
                    labelFilters: {
                        proc: 'indexer',
                    },
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'Indexer Resident Memory (Bytes)', {
                    labelFilters: {
                        proc: 'indexer',
                    },
                }),
                // Search (FTS)
                createMetricPanel(snapshotId, 'sysproc_cpu_utilization', 'Search CPU Utilization (%)', {
                    labelFilters: {
                        proc: 'cbft',
                    },
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'Search Resident Memory (Bytes)', {
                    labelFilters: {
                        proc: 'cbft',
                    },
                }),
                // Eventing
                // mara here: couldnt find the label eventing, did find eventing-produc though 
                createMetricPanel(snapshotId, 'sysproc_cpu_utilization', 'Eventing CPU Utilization (%)', {
                    labelFilters: {
                        proc: 'eventing-produc',
                    },
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'Eventing Resident Memory (Bytes)', {
                    labelFilters: {
                        proc: 'eventing-produc',
                    },
                }),
                // Prometheus
                createMetricPanel(snapshotId, 'sysproc_cpu_utilization', 'Prometheus CPU Utilization (%)', {
                    labelFilters: {
                        proc: 'prometheus',
                    },
                }),
                createMetricPanel(snapshotId, 'sysproc_mem_resident', 'Prometheus Resident Memory (Bytes)', {
                    labelFilters: {
                        proc: 'prometheus',
                    },
                }),

                // Overall Disk utilisation
                createMetricPanel(snapshotId, 'sys_disk_queue', 'Disk Queue (Aggregate)'),
                createMetricPanel(snapshotId, 'couch_docs_actual_disk_size', 'Couch Docs Actual Disk Size (Bytes)', {
                    extraFields: ['d.labels.`bucket`'],
                }),
                // Scrape duration
                createMetricPanel(snapshotId, 'scrape_duration_seconds', 'Scrape Duration (s)'),
            ],
        })
    });
}
