import React from 'react';
import { SceneAppPage, SceneRefreshPicker, EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { dateTime } from '@grafana/data';
import { ROUTES, ROUTE_PATHS, prefixRoute } from '../utils/utils.routing';
import { getDashboardsForServices } from '../pages';
import { locationService } from '@grafana/runtime';
import { SnapshotSearchScene } from './SnapshotSearch';
import { Phase } from '../types/snapshot';
import { SettingsDropdown } from '../components/SettingsDropdown/SettingsDropdown';
import { ClusterToggle } from '../components/ClusterSelector/ClusterToggle';
import { DashboardHeader } from '../components/DashboardHeader/DashboardHeader';
import { PinPanelToggle } from '../components/DashboardHeader/actions/PinPanelToggle';
import { EditModeToggle } from '../components/DashboardHeader/actions/EditModeToggle';
import { ExploreButton } from '../components/DashboardHeader/actions/ExploreButton';
import { MetricsDrilldownButton } from '../components/DashboardHeader/actions/MetricsDrilldownButton';
import { createNoUrlSyncTimeRange, initializeTimeRange } from '../utils/timeRange';
import { clusterDrilldown } from './clusterDrilldownPage';
import { nodeDrilldown } from './nodeDrilldownPage';
import { loadSnapshot } from '../services/snapshotLoader';
import { snapshotService } from '../services/snapshotService';
import { sceneCacheService } from '../services/sceneCache';
import { clusterFilterService } from '../services/clusterFilterService';
import {
    discoverCustomMetricNames,
    clearCustomMetricNamesCache,
} from '../services/customMetricsDiscovery';
import { getAvailableTabs, isTabVisible, type AvailableTab } from '../services/pageBuilder';
import { Spinner } from '@grafana/ui';

// Simple loading scene to show while snapshot is being loaded
class LoadingScene extends SceneObjectBase<SceneObjectState> {
  public static Component = () => {
    return React.createElement('div',
      { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', flexDirection: 'column', gap: '16px' } },
      React.createElement(Spinner, { size: 32 }),
      React.createElement('div', null, 'Loading snapshot...')
    );
  };
}

// Create time range without URL sync, with basic default time range
const timeRange = createNoUrlSyncTimeRange();

/**
 * Search landing page.
 * Route: /snapshots (exact)
 *
 * Renders the SnapshotSearchScene. Reads an optional `?error=...` query param
 * so the viewer page (or a legacy redirect) can surface a load failure here.
 */
export const snapshotSearchPage = new SceneAppPage({
  title: '',
  url: prefixRoute(`${ROUTES.CBMonitor}`),
  routePath: ROUTES.CBMonitor,
  hideFromBreadcrumbs: true,
  getScene: () => {
    const errorMessage = (locationService.getSearchObject().error as string) || undefined;
    return new EmbeddedScene({
      body: new SceneFlexLayout({
        direction: 'column',
        children: [
          new SceneFlexItem({
            body: new SnapshotSearchScene({ errorMessage }),
          }),
        ],
      }),
    });
  },
});

snapshotSearchPage.addActivationHandler(() => {
  // Backwards-compat: rewrite legacy `?snapshotId=<id>` landing URLs to the
  // path-based viewer URL while preserving other query params.
  const params = locationService.getSearchObject();
  if (params.snapshotId) {
    redirectLegacyQueryParam();
  }
});

/**
 * Snapshot viewer page.
 * Route: /snapshots/:snapshotId/* (snapshotId required, splat carries tabs and future drilldowns)
 */
export const snapshotViewPage = new SceneAppPage({
  title: '',
  // The url is a placeholder; the activation handler updates breadcrumbs/title
  // once the snapshot is loaded. We use a non-routable placeholder segment so
  // it doesn't accidentally clash with a real snapshot id in nav links.
  url: prefixRoute(`${ROUTES.CBMonitor}/_`),
  routePath: `${ROUTES.CBMonitor}/:snapshotId/*`,
  hideFromBreadcrumbs: true,
  // Default getScene shows loading while activation handler fetches the snapshot.
  getScene: () => new EmbeddedScene({
    body: new SceneFlexLayout({
      direction: 'column',
      children: [
        new SceneFlexItem({
          body: new LoadingScene({}),
        }),
      ],
    }),
  }),
  drilldowns: [clusterDrilldown, nodeDrilldown],
});

// Activation handler — loads the snapshot for the id in the URL path.
snapshotViewPage.addActivationHandler(() => {
  const initialParams = locationService.getSearchObject();
  if (initialParams.refresh) {
    locationService.partial({ refresh: null }, true);
  }

  // Track time range subscription for cleanup
  let timeRangeSubscription: { unsubscribe: () => void } | null = null;
  // Track currently loaded snapshot to avoid reloading on tab switches
  let currentLoadedSnapshotId: string | null = null;

  const loadSnapshotFromUrl = () => {
    const params = locationService.getSearchObject();
    const snapshotId = getSnapshotIdFromViewerPath(locationService.getLocation().pathname);

    if (!snapshotId) {
      // Viewer URL with no snapshotId — should not happen given the routePath
      // requires :snapshotId. If it does (e.g. someone hits the placeholder),
      // bounce to search.
      locationService.replace(prefixRoute(ROUTE_PATHS.search()));
      return;
    }

    // Skip if this snapshot is already loaded (happens during tab switches)
    if (currentLoadedSnapshotId === snapshotId) {
      return;
    }

    const fetchSnapshot = async () => {
      try {
        if (currentLoadedSnapshotId !== null && currentLoadedSnapshotId !== snapshotId) {
          sceneCacheService.clearAll();
          clusterFilterService.reset();
        }
        currentLoadedSnapshotId = snapshotId;

        const loaded = await loadSnapshot(snapshotId);
        const { metadata } = loaded;

        // Pre-resolve each custom-panels regex (if any) so the
        // synchronous page builder finds the metric lists in cache. A
        // failure on any single entry doesn't block tab rendering — the
        // corresponding tab just won't appear.
        if (Array.isArray(metadata.custom_panels) && metadata.custom_panels.length > 0) {
            await Promise.all(
                metadata.custom_panels
                    .filter((cp) => cp && cp.match)
                    .map(async (cp) => {
                        try {
                            await discoverCustomMetricNames(snapshotId, cp.match);
                        } catch (err) {
                            console.warn(
                                `custom_panels discovery failed for ${snapshotId} (match=${cp.match}); skipping that tab.`,
                                err,
                            );
                        }
                    }),
            );
        }

        // Per-snapshot tab-visibility overrides. Tracked as a mutable
        // local — flipping a switch updates this and persists via the
        // snapshot cache. `availableTabs` is recomputed any time the
        // tab-set changes (metadata refresh).
        let tabOverrides = snapshotService.getTabOverrides(snapshotId);
        let availableTabs = getAvailableTabs(metadata.services, metadata.custom_panels);

        const urlPhase = params.phase as string;
        initializeTimeRange(timeRange, metadata, urlPhase);

        const handleTimeRangeChange = () => {
          const currentTimeRange = timeRange.state;
          const currentFrom = currentTimeRange.value.raw.from?.toString();
          const currentTo = currentTimeRange.value.raw.to?.toString();

          if (metadata.phases) {
            const matchingPhase = metadata.phases.find((p: Phase) => {
              return p.ts_start === currentFrom && p.ts_end === currentTo;
            });

            if (matchingPhase) {
              const currentPhase = (locationService.getSearchObject().phase) as string;
              if (currentPhase !== matchingPhase.label) {
                locationService.partial({ phase: matchingPhase.label }, true);
              }
            } else if (metadata.ts_start === currentFrom && metadata.ts_end === currentTo) {
              const currentPhase = (locationService.getSearchObject().phase) as string;
              if (currentPhase) {
                locationService.partial({ phase: null }, true);
              }
            }
          }
        };

        if (timeRangeSubscription) {
          timeRangeSubscription.unsubscribe();
        }
        timeRangeSubscription = timeRange.subscribeToState(() => {
          handleTimeRangeChange();
        });

        const onSelectPhase = (phaseLabel: string) => {
          if (!metadata.phases || metadata.phases.length === 0) {
            return;
          }
          const selectedPhase = metadata.phases.find((p: Phase) => p.label === phaseLabel);
          if (!selectedPhase) {
            return;
          }
          const nextTo = selectedPhase.ts_end || metadata.ts_end;
          timeRange.onTimeRangeChange({
            from: dateTime(selectedPhase.ts_start),
            to: dateTime(nextTo),
            raw: { from: selectedPhase.ts_start, to: nextTo }
          });
        };

        const onSelectFullRange = () => {
          timeRange.onTimeRangeChange({
            from: dateTime(metadata.ts_start),
            to: dateTime(metadata.ts_end),
            raw: { from: metadata.ts_start, to: metadata.ts_end }
          });
        };

        const handleLayoutChange = () => {
          sceneCacheService.clearAll();
          snapshotViewPage.setState({
            tabs: getDashboardsForServices(metadata.services, snapshotId, metadata.custom_panels, tabOverrides),
          });
        };

        const handleDataSourceChange = () => {
          sceneCacheService.clearAll();
          snapshotViewPage.setState({
            tabs: getDashboardsForServices(metadata.services, snapshotId, metadata.custom_panels, tabOverrides),
          });
        };

        const handleClusterChange = (clusterId: string | null) => {
          clusterFilterService.setCurrentCluster(clusterId);
          sceneCacheService.clearAll();
          snapshotViewPage.setState({
            tabs: getDashboardsForServices(metadata.services, snapshotId, metadata.custom_panels, tabOverrides),
          });
        };

        const handleHideEmptyChange = () => {
          sceneCacheService.clearAll();
          snapshotViewPage.setState({
            tabs: getDashboardsForServices(metadata.services, snapshotId, metadata.custom_panels, tabOverrides),
          });
        };

        const handleTabVisibilityChange = (next: Record<string, boolean>) => {
          tabOverrides = next;
          void snapshotService.setTabOverrides(snapshotId, next);
          sceneCacheService.clearAll();
          settingsDropdown.setState({ tabOverrides: next });
          snapshotViewPage.setState({
            tabs: getDashboardsForServices(metadata.services, snapshotId, metadata.custom_panels, tabOverrides),
          });
          redirectIfActiveTabHidden(snapshotId, availableTabs, tabOverrides);
        };

        const controls: any[] = [];

        const clusterToggle = new ClusterToggle({
          clusters: metadata.clusters || [],
          snapshotId,
          onClusterChange: handleClusterChange,
        });

        if (metadata.ts_end && metadata.ts_end.startsWith("now")) {
          controls.push(new SceneRefreshPicker({
            intervals: ['5s', '10s', '30s', '1m', '2m', '5m', '10m'],
            isOnCanvas: true
          }));
        }

        const settingsDropdown = new SettingsDropdown({
          snapshotId,
          clusters: metadata.clusters || [],
          onLayoutChange: handleLayoutChange,
          onDataSourceChange: handleDataSourceChange,
          onHideEmptyChange: handleHideEmptyChange,
          availableTabs,
          tabOverrides,
          onTabVisibilityChange: handleTabVisibilityChange,
          showClusterSection: false,
        });

        redirectIfActiveTabHidden(snapshotId, availableTabs, tabOverrides);

        snapshotViewPage.setState({
          title: "",
          tabs: getDashboardsForServices(metadata.services, snapshotId, metadata.custom_panels, tabOverrides),
          $timeRange: timeRange,
          controls: controls,
          renderTitle: () => {
            return React.createElement(DashboardHeader, {
              metadata,
              initialActivePhase: urlPhase || null,
              onSelectPhase,
              onSelectFullRange,
              clusterToggle,
              settingsDropdown,
              actions: [
                { key: 'pin', render: () => React.createElement(PinPanelToggle, {}) },
                { key: 'edit', render: () => React.createElement(EditModeToggle, {}) },
                { key: 'explore', render: () => React.createElement(ExploreButton, { snapshotId, timeRange }) },
                { key: 'metricsDrilldown', render: () => React.createElement(MetricsDrilldownButton, { snapshotId, timeRange }) },
              ],
            });
          },
          getScene: undefined,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load snapshot';
        console.error('Error loading snapshot:', errorMessage);
        // Redirect to the search page with the error message surfaced there.
        const target = `${prefixRoute(ROUTE_PATHS.search())}?error=${encodeURIComponent(errorMessage)}`;
        locationService.replace(target);
        currentLoadedSnapshotId = null;
      }
    };

    fetchSnapshot();
  };

  loadSnapshotFromUrl();

  const urlSubscription = locationService.getHistory().listen(() => {
    const newSnapshotId = getSnapshotIdFromViewerPath(locationService.getLocation().pathname);
    if (newSnapshotId !== currentLoadedSnapshotId) {
      loadSnapshotFromUrl();
    }
  });

  // When the user clicks "Refresh metadata" in the details drawer, the
  // snapshotService re-fetches and emits a refresh event. Rebuild the page
  // scene against the fresh metadata so panels, phases, and the time
  // picker pick up newly-landed phases without a full reload.
  const unsubscribeRefresh = snapshotService.onSnapshotRefreshed((refreshedId) => {
    if (refreshedId !== currentLoadedSnapshotId) {
      return;
    }
    sceneCacheService.clearForSnapshot(refreshedId);
    clearCustomMetricNamesCache(refreshedId);
    currentLoadedSnapshotId = null;
    loadSnapshotFromUrl();
  });

  return () => {
    urlSubscription();
    unsubscribeRefresh();
    if (timeRangeSubscription) {
      timeRangeSubscription.unsubscribe();
    }
  };
});

// Return the tab segment from the current pathname for the given
// snapshot, or '' for the segment-less default tab (system). Returns
// undefined when the URL doesn't point at this snapshot at all.
function getActiveTabSegment(snapshotId: string): string | undefined {
  const base = prefixRoute(`${ROUTES.CBMonitor}/${encodeURIComponent(snapshotId)}`);
  const path = locationService.getLocation().pathname;
  if (path === base) {
    return '';
  }
  if (path.startsWith(`${base}/`)) {
    return path.slice(base.length + 1).split('/')[0];
  }
  return undefined;
}

// Grafana Scenes doesn't gracefully fall back when the URL points at a
// tab that's been removed from the tabs array — the user sees a 404.
// Detect that case and replace the URL with the first visible tab's URL.
// Called both on initial snapshot load and after a visibility toggle.
function redirectIfActiveTabHidden(
  snapshotId: string,
  available: AvailableTab[],
  overrides: Record<string, boolean>,
): void {
  const visible = available.filter((t) => isTabVisible(t, overrides));
  if (visible.length === 0) {
    return;
  }
  const active = getActiveTabSegment(snapshotId);
  if (active === undefined) {
    return;
  }
  if (visible.some((t) => t.segment === active)) {
    return;
  }
  const base = prefixRoute(`${ROUTES.CBMonitor}/${encodeURIComponent(snapshotId)}`);
  const firstSegment = visible[0].segment;
  const target = firstSegment ? `${base}/${firstSegment}` : base;
  locationService.replace(target);
}

// Extract snapshotId from a viewer pathname like `/a/cbmonitor/snapshots/<id>[/...]`.
// Returns undefined for the bare `/snapshots` search path or unrelated paths.
// Skips the literal `_` placeholder used as the page's default url.
function getSnapshotIdFromViewerPath(pathname: string): string | undefined {
  const prefix = `${prefixRoute(ROUTES.CBMonitor)}/`;
  if (!pathname.startsWith(prefix)) {
    return undefined;
  }
  const rest = pathname.slice(prefix.length);
  const segments = rest.split('/').filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }
  const candidate = decodeURIComponent(segments[0]);
  if (candidate === '_') {
    return undefined;
  }
  return candidate;
}

// Rewrite a legacy `?snapshotId=<id>` URL to `/snapshots/<id>` while preserving
// any other query params (e.g. `phase`). Uses replace() so the legacy URL
// doesn't pollute browser history.
function redirectLegacyQueryParam() {
  const params = locationService.getSearchObject();
  const legacyId = params.snapshotId as string | undefined;
  if (!legacyId) {
    return;
  }
  const { snapshotId: _drop, ...rest } = params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const v of value) {
        query.append(key, String(v));
      }
    } else {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  const target = `${prefixRoute(ROUTE_PATHS.snapshotView(legacyId))}${qs ? `?${qs}` : ''}`;
  locationService.replace(target);
}
