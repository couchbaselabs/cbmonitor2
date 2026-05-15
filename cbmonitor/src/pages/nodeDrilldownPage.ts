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
import { instanceFilterService } from '../services/instanceFilterService';
import { createNoUrlSyncTimeRange, initializeTimeRange } from '../utils/timeRange';

class LoadingScene extends SceneObjectBase<SceneObjectState> {
  public static Component = () => React.createElement(
    'div',
    { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', flexDirection: 'column', gap: '16px' } },
    React.createElement(Spinner, { size: 32 }),
    React.createElement('div', null, 'Loading node…')
  );
}

/**
 * Build the URL for a node drilldown page.
 * Shape: `/a/cbmonitor/snapshots/<snapshotId>/nodes/<nodeName>`.
 * Node name is URL-encoded so values like `host:port` round-trip safely.
 */
export function nodeDrilldownUrl(snapshotId: string, nodeName: string): string {
  return prefixRoute(
    `${ROUTES.CBMonitor}/${encodeURIComponent(snapshotId)}/nodes/${encodeURIComponent(nodeName)}`
  );
}

/**
 * Scenes drilldown registration for the node page. Mounted under the snapshot
 * viewer (`/snapshots/:snapshotId/*`) at the relative path `nodes/:nodeName`.
 */
export const nodeDrilldown: SceneAppDrilldownView = {
  routePath: 'nodes/:nodeName/*',
  getPage: (routeMatch: SceneRouteMatch<{ snapshotId: string; nodeName: string }>, parent: SceneAppPageLike) => {
    return buildNodeDrilldownPage(routeMatch.params.snapshotId, routeMatch.params.nodeName, parent);
  },
};

function buildNodeDrilldownPage(snapshotId: string, nodeName: string, parent: SceneAppPageLike): SceneAppPage {
  const page = new SceneAppPage({
    title: `Node ${nodeName}`,
    url: nodeDrilldownUrl(snapshotId, nodeName),
    routePath: `nodes/:nodeName/*`,
    getParentPage: () => parent,
    getScene: () => new EmbeddedScene({
      body: new SceneFlexLayout({
        direction: 'column',
        children: [new SceneFlexItem({ body: new LoadingScene({}) })],
      }),
    }),
  });

  page.addActivationHandler(() => {
    // Save & override the global instance filter so every panel built while
    // this drilldown is mounted (including dynamic per-instance discovery in
    // `createInstanceAwareScene`) is scoped to this one node.
    const previousInstanceFilter = instanceFilterService.getCurrentInstance();
    instanceFilterService.setCurrentInstance(nodeName);
    sceneCacheService.clearAll();

    let cancelled = false;

    (async () => {
      try {
        const { metadata } = await loadSnapshot(snapshotId);
        if (cancelled) {
          return;
        }

        // Match the snapshot's time window so panels query the right range.
        const timeRange = createNoUrlSyncTimeRange();
        initializeTimeRange(timeRange, metadata, undefined);

        const tabs = buildServiceTabs({
          snapshotIds: [snapshotId],
          services: metadata.services,
          mode: 'single',
          routePrefix: ROUTES.CBMonitor,
          urlBase: `${ROUTES.CBMonitor}/${encodeURIComponent(snapshotId)}/nodes/${encodeURIComponent(nodeName)}`,
        });

        page.setState({
          title: `Node: ${nodeName}`,
          $timeRange: timeRange,
          tabs,
          getScene: undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load node';
        console.error('Error loading node drilldown:', message);
        page.setState({
          subTitle: `Unable to load node — ${message}`,
        });
      }
    })();

    return () => {
      cancelled = true;
      // Restore the previous instance filter (typically null on the parent).
      instanceFilterService.setCurrentInstance(previousInstanceFilter);
      sceneCacheService.clearAll();
    };
  });

  return page;
}
