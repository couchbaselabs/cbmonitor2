import { SceneFlexLayout } from '@grafana/scenes';
import { BigValueGraphMode } from '@grafana/schema';
import { SnapshotMetadata } from '../types/snapshot';
import { createStatPanel } from '../utils/statPanel';
import { createNoUrlSyncTimeRange, initializeTimeRange } from '../utils/timeRange';

const STAT_HEIGHT = 110;
const STAT_MIN_WIDTH = '180px';

/**
 * Overview layout for a cluster drilldown. Returned as a `SceneFlexLayout`
 * (not an EmbeddedScene) because EmbeddedScene's container CSS
 * (`flex-grow: 1; min-height: 100%`) inflates inside the page header slot
 * and overlays the tab body, blocking clicks on panels below. The layout
 * carries its own `$timeRange` so query runners walking up the scene graph
 * find a snapshot-aligned range instead of Grafana's global default.
 */
export function buildClusterOverviewScene(
    snapshotId: string,
    _clusterUid: string,
    metadata: SnapshotMetadata
): SceneFlexLayout {
    const timeRange = createNoUrlSyncTimeRange();
    initializeTimeRange(timeRange, metadata, undefined);

    return new SceneFlexLayout({
        direction: 'row',
        wrap: 'wrap',
        $timeRange: timeRange,
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
}

/**
 * Overview layout for a node drilldown. See `buildClusterOverviewScene` for
 * why this returns a `SceneFlexLayout` rather than an `EmbeddedScene`.
 */
export function buildNodeOverviewScene(
    snapshotId: string,
    _nodeName: string,
    metadata: SnapshotMetadata
): SceneFlexLayout {
    const timeRange = createNoUrlSyncTimeRange();
    initializeTimeRange(timeRange, metadata, undefined);

    return new SceneFlexLayout({
        direction: 'row',
        wrap: 'wrap',
        $timeRange: timeRange,
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
}
