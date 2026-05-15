import React from 'react';
import {
  SceneAppDrilldownView,
  SceneAppPage,
  SceneAppPageLike,
  SceneRouteMatch,
  EmbeddedScene,
  SceneFlexLayout,
  SceneFlexItem,
  SceneObjectBase,
  SceneObjectState,
} from '@grafana/scenes';
import { Spinner } from '@grafana/ui';
import { ROUTES, prefixRoute } from '../utils/utils.routing';
import { loadSnapshot } from '../services/snapshotLoader';
import { buildServiceTabs } from '../services/pageBuilder';
import { sceneCacheService } from '../services/sceneCache';
import { clusterFilterService } from '../services/clusterFilterService';
import { createNoUrlSyncTimeRange, initializeTimeRange } from '../utils/timeRange';

// Reusable loading placeholder while the snapshot metadata resolves.
class LoadingScene extends SceneObjectBase<SceneObjectState> {
  public static Component = () => React.createElement(
    'div',
    { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', flexDirection: 'column', gap: '16px' } },
    React.createElement(Spinner, { size: 32 }),
    React.createElement('div', null, 'Loading cluster…')
  );
}

/**
 * Build the URL for a cluster drilldown page.
 * Shape: `/a/cbmonitor/snapshots/<snapshotId>/clusters/<clusterUid>`.
 */
export function clusterDrilldownUrl(snapshotId: string, clusterUid: string): string {
  return prefixRoute(
    `${ROUTES.CBMonitor}/${encodeURIComponent(snapshotId)}/clusters/${encodeURIComponent(clusterUid)}`
  );
}

/**
 * Scenes drilldown registration for the cluster page. Mounts under the
 * snapshot viewer page (`/snapshots/:snapshotId/*`) at the relative path
 * `clusters/:clusterUid`. The `getPage` factory receives `routeMatch.params`
 * with both `snapshotId` (from parent) and `clusterUid` (from this drilldown).
 */
export const clusterDrilldown: SceneAppDrilldownView = {
  routePath: 'clusters/:clusterUid/*',
  getPage: (routeMatch: SceneRouteMatch<{ snapshotId: string; clusterUid: string }>, parent: SceneAppPageLike) => {
    return buildClusterDrilldownPage(routeMatch.params.snapshotId, routeMatch.params.clusterUid, parent);
  },
};

function buildClusterDrilldownPage(snapshotId: string, clusterUid: string, parent: SceneAppPageLike): SceneAppPage {
  const page = new SceneAppPage({
    title: `Cluster ${clusterUid}`,
    url: clusterDrilldownUrl(snapshotId, clusterUid),
    routePath: `clusters/:clusterUid/*`,
    getParentPage: () => parent,
    getScene: () => new EmbeddedScene({
      body: new SceneFlexLayout({
        direction: 'column',
        children: [new SceneFlexItem({ body: new LoadingScene({}) })],
      }),
    }),
  });

  page.addActivationHandler(() => {
    // Capture the prior cluster filter so we can restore on deactivation.
    // This preserves a user's in-place ClusterToggle selection when they
    // navigate back to the parent snapshot page via the breadcrumb.
    const previousClusterFilter = clusterFilterService.getCurrentCluster();
    clusterFilterService.setCurrentCluster(clusterUid);
    // Clear scene cache so existing per-service panels rebuild with the
    // cluster filter that's now active.
    sceneCacheService.clearAll();

    let cancelled = false;

    (async () => {
      try {
        const { metadata } = await loadSnapshot(snapshotId);
        if (cancelled) {
          return;
        }

        // Resolve a human-friendly cluster name from metadata; fall back to uid.
        const cluster = metadata.clusters?.find(c => c.uid === clusterUid);
        const clusterName = cluster?.name?.trim() || clusterUid;

        // Initialise a time range matching the snapshot's window (or active
        // phase, if present in the URL) so panels query the right interval.
        // Without this they fall back to Grafana's default global range and
        // appear empty when the snapshot is older than that window.
        const timeRange = createNoUrlSyncTimeRange();
        const urlPhase = undefined;
        initializeTimeRange(timeRange, metadata, urlPhase);

        const tabs = buildServiceTabs({
          snapshotIds: [snapshotId],
          services: metadata.services,
          mode: 'single',
          routePrefix: ROUTES.CBMonitor,
          urlBase: `${ROUTES.CBMonitor}/${encodeURIComponent(snapshotId)}/clusters/${encodeURIComponent(clusterUid)}`,
        });

        page.setState({
          title: `Cluster: ${clusterName}`,
          subTitle: cluster?.name ? `UUID: ${clusterUid}` : undefined,
          $timeRange: timeRange,
          tabs,
          getScene: undefined,
          renderTitle: () => React.createElement(ClusterHeader, {
            clusterName,
            clusterUid,
          }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load cluster';
        console.error('Error loading cluster drilldown:', message);
        page.setState({
          subTitle: `Unable to load cluster — ${message}`,
        });
      }
    })();

    return () => {
      cancelled = true;
      // Restore the previous filter so the parent page returns to whatever
      // cluster context the user had before drilling in.
      clusterFilterService.setCurrentCluster(previousClusterFilter);
      sceneCacheService.clearAll();
    };
  });

  return page;
}

interface ClusterHeaderProps {
  clusterName: string;
  clusterUid: string;
}

// Header for the cluster drilldown. Node discovery has moved to legend
// DataLinks on each panel + the Nodes section in `SnapshotDetailsDrawer`, so
// this header just identifies the cluster.
function ClusterHeader({ clusterName, clusterUid }: ClusterHeaderProps) {
  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
    React.createElement(
      'h2',
      { style: { margin: 0, fontSize: '20px' } },
      `Cluster: ${clusterName}`
    ),
    clusterName !== clusterUid
      ? React.createElement(
          'div',
          { style: { fontSize: '12px', opacity: 0.7 } },
          `UUID: ${clusterUid}`
        )
      : null
  );
}
