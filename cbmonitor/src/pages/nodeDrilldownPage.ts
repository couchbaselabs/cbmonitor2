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
import { buildNodeOverviewScene } from './drilldownOverview';

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

        const urlBase = `${ROUTES.CBMonitor}/${encodeURIComponent(snapshotId)}/nodes/${encodeURIComponent(nodeName)}`;
        const serviceTabs = buildServiceTabs({
          snapshotIds: [snapshotId],
          services: metadata.services,
          mode: 'single',
          routePrefix: ROUTES.CBMonitor,
          urlBase,
        });
        // Built once and reused across tab switches; the overview's queries
        // activate on mount and stay alive as the user clicks between tabs.
        const overviewScene = buildNodeOverviewScene(snapshotId, nodeName, metadata);

        page.setState({
          title: `Node: ${nodeName}`,
          $timeRange: timeRange,
          tabs: serviceTabs,
          getScene: undefined,
          renderTitle: () => React.createElement(NodeHeader, {
            nodeName,
            overviewScene,
          }),
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

interface NodeHeaderProps {
  nodeName: string;
  overviewScene: SceneFlexLayout;
}

// Header for the node drilldown: title + the overview stats layout rendered
// inline so the summary sits above the tabs and stays mounted across tab
// switches. The wrapper is height-bounded to keep the page header's flex
// column from inflating the overview and overlaying the body — see
// `ClusterHeader` in `clusterDrilldownPage.ts` for the full rationale.
function NodeHeader({ nodeName, overviewScene }: NodeHeaderProps) {
  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    React.createElement(
      'h2',
      { style: { margin: 0, fontSize: '20px' } },
      `Node: ${nodeName}`
    ),
    React.createElement(
      'div',
      { style: { width: '100%', height: 110, flex: '0 0 auto', display: 'flex' } },
      React.createElement(overviewScene.Component, { model: overviewScene })
    )
  );
}
