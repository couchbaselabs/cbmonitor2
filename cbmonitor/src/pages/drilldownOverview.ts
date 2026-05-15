import { EmbeddedScene, SceneFlexLayout } from '@grafana/scenes';
import { BigValueGraphMode } from '@grafana/schema';
import { SnapshotMetadata } from '../types/snapshot';
import { createStatPanel } from '../utils/statPanel';
import { createNoUrlSyncTimeRange, initializeTimeRange } from '../utils/timeRange';

// Shared sizing so cluster + node overviews stay visually consistent.
// Tall enough for the title + big value + sparkline to render legibly, and
// a real min-width so the numbers don't get squeezed when the header is
// narrow — panels wrap to a second row instead.
const STAT_HEIGHT = 110;
const STAT_MIN_WIDTH = '180px';

/**
 * Overview scene for a cluster drilldown. Shows headline numbers that span
 * the whole cluster — node count, CPU avg/peak, memory used — which the
 * per-service tabs don't surface in one place. Filters (cluster_uuid) are
 * injected by `createStatPanel` from the active filter service.
 */
export function buildClusterOverviewScene(
    snapshotId: string,
    _clusterUid: string,
    metadata: SnapshotMetadata
): EmbeddedScene {
    // Overview is rendered outside the SceneAppPage's scene tree (via
    // renderTitle), so it needs its own $timeRange — query runners walk up
    // their own scene graph to find one and otherwise fall back to Grafana's
    // default global range, which doesn't include the snapshot data.
    const timeRange = createNoUrlSyncTimeRange();
    initializeTimeRange(timeRange, metadata, undefined);

    const stats = new SceneFlexLayout({
        direction: 'row',
        wrap: 'wrap',
        children: [
            createStatPanel('cluster_node_count', 'Nodes', {
                expr: `count(group by (instance) (sys_cpu_utilization_rate{job="${snapshotId}"}))`,
                unit: 'short',
                decimals: 0,
                graphMode: BigValueGraphMode.None,
                height: STAT_HEIGHT,
                minWidth: STAT_MIN_WIDTH,
            }),
            createStatPanel('cluster_avg_cpu', 'Avg CPU %', {
                expr: `avg(avg_over_time(sys_cpu_utilization_rate{job="${snapshotId}"}[$__range]))`,
                unit: 'percent',
                decimals: 1,
                height: STAT_HEIGHT,
                minWidth: STAT_MIN_WIDTH,
            }),
            createStatPanel('cluster_peak_cpu', 'Peak CPU %', {
                expr: `max(max_over_time(sys_cpu_utilization_rate{job="${snapshotId}"}[$__range]))`,
                unit: 'percent',
                decimals: 1,
                height: STAT_HEIGHT,
                minWidth: STAT_MIN_WIDTH,
            }),
            createStatPanel('cluster_avg_mem', 'Avg Memory Used', {
                expr: `avg(avg_over_time(sys_mem_used_sys{job="${snapshotId}"}[$__range]))`,
                unit: 'bytes',
                decimals: 1,
                height: STAT_HEIGHT,
                minWidth: STAT_MIN_WIDTH,
            }),
        ],
    });

    return new EmbeddedScene({ body: stats, $timeRange: timeRange });
}

/**
 * Overview scene for a node drilldown. Same shape as cluster overview but
 * scoped to a single instance (filter injected by `createStatPanel`).
 */
export function buildNodeOverviewScene(
    snapshotId: string,
    _nodeName: string,
    metadata: SnapshotMetadata
): EmbeddedScene {
    const timeRange = createNoUrlSyncTimeRange();
    initializeTimeRange(timeRange, metadata, undefined);

    const stats = new SceneFlexLayout({
        direction: 'row',
        wrap: 'wrap',
        children: [
            createStatPanel('node_avg_cpu', 'Avg CPU %', {
                expr: `avg(avg_over_time(sys_cpu_utilization_rate{job="${snapshotId}"}[$__range]))`,
                unit: 'percent',
                decimals: 1,
                height: STAT_HEIGHT,
                minWidth: STAT_MIN_WIDTH,
            }),
            createStatPanel('node_peak_cpu', 'Peak CPU %', {
                expr: `max(max_over_time(sys_cpu_utilization_rate{job="${snapshotId}"}[$__range]))`,
                unit: 'percent',
                decimals: 1,
                height: STAT_HEIGHT,
                minWidth: STAT_MIN_WIDTH,
            }),
            createStatPanel('node_avg_mem_used', 'Avg Memory Used', {
                expr: `avg(avg_over_time(sys_mem_used_sys{job="${snapshotId}"}[$__range]))`,
                unit: 'bytes',
                decimals: 1,
                height: STAT_HEIGHT,
                minWidth: STAT_MIN_WIDTH,
            }),
            createStatPanel('node_avg_mem_free', 'Avg Memory Free', {
                expr: `avg(avg_over_time(sys_mem_free_sys{job="${snapshotId}"}[$__range]))`,
                unit: 'bytes',
                decimals: 1,
                height: STAT_HEIGHT,
                minWidth: STAT_MIN_WIDTH,
            }),
        ],
    });

    return new EmbeddedScene({ body: stats, $timeRange: timeRange });
}

