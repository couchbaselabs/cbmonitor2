import { SceneAppPage, EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneTimeRange, SceneDataLayerSet } from '@grafana/scenes';
import { prefixRoute } from '../utils/utils.routing';
import { SERVICE_CONFIGS, getServiceConfigs, getServiceConfig, normalizeServiceName, type ServiceConfig } from '../config/services';
import { sceneCacheService } from './sceneCache';
import { clusterFilterService } from './clusterFilterService';
import { instanceFilterService } from './instanceFilterService';
import { layoutService } from './layoutService';
import { SnapshotPhaseRegionsLayer } from '../layers/SnapshotPhaseRegionsLayer';
import { StatusScene } from '../components/SceneComponents/StatusScene';
import {
    createInstanceAwareScene,
    createInstanceAwareOverlapScene,
} from '../utils/instanceScene';
import type { CustomPanelsConfig } from '../types/snapshot';
import { makeCustomBuilder } from '../dashboards/custom';
import { getCachedCustomMetricNames } from './customMetricsDiscovery';

/**
 * A single tab that the snapshot view *could* show. Drives both the
 * SettingsDropdown checkbox list and `buildServiceTabs`'s filter. Each
 * tab has a `defaultVisible` flag computed from snapshot metadata at
 * view time; the user can override it via `tabOverrides`.
 */
export interface AvailableTab {
    key: string;
    title: string;
    defaultVisible: boolean;
    kind: 'builtin' | 'custom';
    /** Present for builtin tabs only. */
    serviceKey?: string;
    /** Present for custom tabs only. */
    customConfig?: CustomPanelsConfig;
    /** URL segment. For builtins, the ServiceConfig.segment (may be ''). For custom tabs, the slugged 'custom-…'. */
    segment: string;
}

/**
 * Compute the full set of available tabs for a snapshot.
 *
 * Every builtin in SERVICE_CONFIGS is included (defaultVisible iff
 * `alwaysInclude` or listed in `services`). Each `customPanels` entry
 * is appended, defaultVisible=true.
 */
export function getAvailableTabs(
    services: string[] | undefined,
    customPanels?: CustomPanelsConfig[],
): AvailableTab[] {
    // Canonicalize the metadata's services through `normalizeServiceName`
    // so aliases (e.g. "n1ql" → "query", "sync-gateway" → "sgw") and case
    // variants are treated as the canonical key — matching the lookup
    // semantics used by `getServiceConfigs`.
    const lookup = new Set((services ?? []).map((s) => normalizeServiceName(s)));
    const tabs: AvailableTab[] = SERVICE_CONFIGS.map((cfg) => ({
        key: cfg.key,
        title: cfg.title,
        defaultVisible: Boolean(cfg.alwaysInclude) || lookup.has(cfg.key),
        kind: 'builtin',
        serviceKey: cfg.key,
        segment: cfg.segment,
    }));

    if (customPanels && customPanels.length > 0) {
        const usedSegments = new Set<string>();
        customPanels.forEach((cp, idx) => {
            const segment = uniqueCustomSegment(cp, idx, usedSegments);
            tabs.push({
                key: segment,
                title: cp.title?.trim() || 'Custom',
                defaultVisible: true,
                kind: 'custom',
                customConfig: cp,
                segment,
            });
        });
    }

    return tabs;
}

/**
 * Resolve a tab's effective visibility: explicit user override wins,
 * else the default computed at view time.
 */
export function isTabVisible(tab: AvailableTab, overrides?: Record<string, boolean>): boolean {
    const override = overrides?.[tab.key];
    return typeof override === 'boolean' ? override : tab.defaultVisible;
}

/**
 * Options for building service tabs/pages
 */
export interface PageBuilderOptions {
    snapshotIds: string[];
    services: string[];
    mode: 'single' | 'comparison';
    routePrefix: string;
    timeRanges?: SceneTimeRange[];
    overlapMode?: boolean;
    overlapEndTimeSeconds?: number;
    /**
     * Optional base URL for single-snapshot tabs. Defaults to
     * `${routePrefix}/${snapshotId}`. Set this when tabs live underneath a
     * deeper path (e.g. a cluster drilldown at
     * `/snapshots/<id>/clusters/<uid>`) so each tab's URL stays under the
     * drilldown route.
     */
    urlBase?: string;
    /**
     * Optional snapshot-declared custom panel configs. Each entry becomes
     * its own tab appended after the regular services in single-mode.
     * Ignored in comparison mode (the custom-metric set may differ between
     * snapshots, so we don't attempt to render it side-by-side).
     */
    customPanels?: CustomPanelsConfig[];
    /**
     * Per-snapshot tab-visibility overrides. Single-mode only. Tabs with
     * an explicit `false` are hidden; tabs that are off by default but
     * have an explicit `true` are shown.
     */
    tabOverrides?: Record<string, boolean>;
}

/**
 * Build service tabs for either single snapshot or comparison view.
 * This is the unified page building function used across the application.
 *
 * @param options - Configuration for page building
 * @returns Array of SceneAppPage instances for each service
 *
 * @example
 * // Build single snapshot pages
 * const tabs = buildServiceTabs({
 *   snapshotIds: ['abc-123'],
 *   services: ['kv', 'query', 'index'],
 *   mode: 'single',
 *   routePrefix: ROUTES.CBMonitor
 * });
 *
 * @example
 * // Build comparison pages
 * const tabs = buildServiceTabs({
 *   snapshotIds: ['abc-123', 'def-456'],
 *   services: ['kv', 'query'],
 *   mode: 'comparison',
 *   routePrefix: ROUTES.Compare,
 *   timeRanges: [timeRange1, timeRange2]
 * });
 */
export function buildServiceTabs(options: PageBuilderOptions): SceneAppPage[] {
    const { snapshotIds, services, mode, routePrefix, timeRanges, overlapMode, overlapEndTimeSeconds, urlBase, customPanels, tabOverrides } = options;

    if (mode === 'single' && snapshotIds.length !== 1) {
        throw new Error('Single mode requires exactly one snapshot ID');
    }

    if (mode === 'comparison' && snapshotIds.length < 2) {
        throw new Error('Comparison mode requires at least 2 snapshot IDs');
    }

    if (mode === 'comparison' && timeRanges && timeRanges.length !== snapshotIds.length) {
        throw new Error('Number of time ranges must match number of snapshots');
    }

    const pages: SceneAppPage[] = [];

    if (mode === 'single') {
        const available = getAvailableTabs(services, customPanels);
        for (const tab of available) {
            if (!isTabVisible(tab, tabOverrides)) {
                continue;
            }
            if (tab.kind === 'builtin') {
                pages.push(buildSingleSnapshotPage(tab.serviceKey!, snapshotIds[0], routePrefix, urlBase));
            } else {
                const built = buildCustomPanelsPage(snapshotIds[0], routePrefix, tab.customConfig!, tab.segment, urlBase);
                if (built) {
                    pages.push(built);
                }
            }
        }
        return pages;
    }

    // Comparison mode: visibility filter is not applied (the union of
    // services between snapshots is what `getServiceConfigs` already
    // returns).
    const serviceConfigs = getServiceConfigs(services);
    for (const config of serviceConfigs) {
        pages.push(buildComparisonPage(config.key, snapshotIds, routePrefix, timeRanges, overlapMode, overlapEndTimeSeconds));
    }
    return pages;
}

/**
 * Slugify a custom-panels title into a URL-safe segment, deduping
 * collisions by appending a numeric suffix. Falls back to
 * `custom-<idx>` when the title is empty / non-alphanumeric.
 */
function uniqueCustomSegment(cp: CustomPanelsConfig, idx: number, used: Set<string>): string {
    const base = (cp.title ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    let candidate = base ? `custom-${base}` : `custom-${idx}`;
    let n = 2;
    while (used.has(candidate)) {
        candidate = (base ? `custom-${base}` : `custom-${idx}`) + `-${n++}`;
    }
    used.add(candidate);
    return candidate;
}

/**
 * Drive a service's panel builder through the single-mode scene driver.
 * Single shared helper used by both the single-snapshot view and the
 * side-by-side comparison view (one scene per snapshot).
 */
function buildSingleScene(config: ServiceConfig, snapshotId: string): EmbeddedScene {
    return createInstanceAwareScene(snapshotId, config.builder, {
        instanceMetric: config.instanceMetric,
    });
}

/**
 * Build a page for a single snapshot and service.
 * Uses caching to avoid recreating scenes on tab switches.
 */
function buildSingleSnapshotPage(
    serviceKey: string,
    snapshotId: string,
    routePrefix: string,
    urlBase?: string
): SceneAppPage {
    const config = getServiceConfig(serviceKey);

    if (!config) {
        throw new Error(`Unknown service: ${serviceKey}`);
    }

    // Default base: `<routePrefix>/<snapshotId>`. Caller may override (e.g. for
    // drilldowns nested deeper than the snapshot page).
    const base = urlBase ?? `${routePrefix}/${encodeURIComponent(snapshotId)}`;
    const urlPath = config.segment
        ? `${base}/${config.segment}`
        : base;

    const routePath = config.segment
        ? `/${config.segment}`
        : '/';

    return new SceneAppPage({
        title: config.title,
        url: prefixRoute(urlPath),
        routePath,
        getScene: () => {
            // Include cluster + instance filters and hideEmpty in cache key so
            // scenes are rebuilt whenever these settings change (drilldown
            // pages activate filters that the parent doesn't, so the cache
            // must distinguish those variants).
            const currentCluster = clusterFilterService.getCurrentCluster();
            const currentInstance = instanceFilterService.getCurrentInstance();
            const hideEmpty = layoutService.getHideEmptyPanels();
            const cacheKey = {
                snapshotId,
                serviceKey,
                dashboardType: config.segment || 'system',
                additional: `cluster:${currentCluster ?? 'all'}_instance:${currentInstance ?? 'all'}_hideEmpty:${hideEmpty}`
            };

            // Check cache first
            if (!sceneCacheService.hasScene(cacheKey)) {
                // Create and cache the scene
                const scene = buildSingleScene(config, snapshotId);
                sceneCacheService.setScene(cacheKey, scene);

                // Attach global phase regions layer
                const globalLayers = new SceneDataLayerSet({
                    layers: [
                        new SnapshotPhaseRegionsLayer({
                            isEnabled: true,
                            snapshotId,
                            name: 'Snapshot Phases'
                        })
                    ],
                });

                // If the scene doesn't already have a $data provider, set the global layer set
                const currentState: any = (scene as any).state || {};
                if (!currentState.$data) {
                    scene.setState({ $data: globalLayers });
                }
            }

            return sceneCacheService.getScene(cacheKey)!;
        },
    });
}

/**
 * Build a single optional custom tab from one custom_panels entry.
 * Returns null when no metric names have been resolved (viewer
 * pre-fetches them before the first build, so this guards against an
 * empty result rather than expecting a real cache miss).
 */
function buildCustomPanelsPage(
    snapshotId: string,
    routePrefix: string,
    customPanels: CustomPanelsConfig,
    segment: string,
    urlBase?: string,
): SceneAppPage | null {
    const discovered = getCachedCustomMetricNames(snapshotId, customPanels.match);
    if (!discovered || discovered.names.length === 0) {
        return null;
    }

    const title = customPanels.title?.trim() || 'Custom';
    const builder = makeCustomBuilder(snapshotId, customPanels);
    const instanceMetric = discovered.names[0];

    const base = urlBase ?? `${routePrefix}/${encodeURIComponent(snapshotId)}`;
    const urlPath = `${base}/${segment}`;

    return new SceneAppPage({
        title,
        url: prefixRoute(urlPath),
        routePath: `/${segment}`,
        getScene: () => {
            const currentCluster = clusterFilterService.getCurrentCluster();
            const currentInstance = instanceFilterService.getCurrentInstance();
            const hideEmpty = layoutService.getHideEmptyPanels();
            const cacheKey = {
                snapshotId,
                serviceKey: segment,
                dashboardType: segment,
                additional: `cluster:${currentCluster ?? 'all'}_instance:${currentInstance ?? 'all'}_hideEmpty:${hideEmpty}_match:${customPanels.match}`,
            };

            if (!sceneCacheService.hasScene(cacheKey)) {
                const scene = createInstanceAwareScene(snapshotId, builder, { instanceMetric });
                sceneCacheService.setScene(cacheKey, scene);

                const globalLayers = new SceneDataLayerSet({
                    layers: [
                        new SnapshotPhaseRegionsLayer({
                            isEnabled: true,
                            snapshotId,
                            name: 'Snapshot Phases',
                        }),
                    ],
                });
                const currentState: any = (scene as any).state || {};
                if (!currentState.$data) {
                    scene.setState({ $data: globalLayers });
                }
            }

            return sceneCacheService.getScene(cacheKey)!;
        },
    });
}

/**
 * Build a comparison page for multiple snapshots and a service.
 * Shows side-by-side views or overlap mode placeholders.
 */
function buildComparisonPage(
    serviceKey: string,
    snapshotIds: string[],
    routePrefix: string,
    timeRanges?: SceneTimeRange[],
    overlapMode?: boolean,
    overlapEndTimeSeconds?: number
): SceneAppPage {
    const config = getServiceConfig(serviceKey);

    if (!config) {
        throw new Error(`Unknown service: ${serviceKey}`);
    }

    const urlPath = config.segment
        ? `${routePrefix}/${config.segment}`
        : routePrefix;

    const routePath = config.segment
        ? `/${config.segment}`
        : '/';

    return new SceneAppPage({
        title: config.title,
        url: prefixRoute(urlPath),
        routePath,
        getScene: () => {
            // Validate we have time ranges for comparison mode
            if (timeRanges && timeRanges.length !== snapshotIds.length) {
                return new EmbeddedScene({
                    body: new SceneFlexLayout({
                        direction: 'column',
                        children: [
                            new SceneFlexItem({
                                body: new StatusScene({
                                    message: 'Time ranges not properly initialized. Reload the page.',
                                    status: 'error'
                                }) as any,
                            }),
                        ],
                    }),
                });
            }

            // If overlap mode is enabled
            if (overlapMode) {
                const overlapSnapshotIds = snapshotIds.join('|');
                return createInstanceAwareOverlapScene(overlapSnapshotIds, config.builder, {
                    instanceMetric: config.overlapInstanceMetric ?? config.instanceMetric,
                    overlapEndTimeSeconds,
                });
            }

            // Build side-by-side comparison view
            const count = snapshotIds.length;
            const width = `${(100 / count).toFixed(2)}%`;

            const children = snapshotIds.map((sid, idx) => {
                const cacheKey = {
                    snapshotId: sid,
                    serviceKey,
                    additional: 'comparison'
                };

                // Check cache first
                let scene = sceneCacheService.getScene(cacheKey);
                if (!scene) {
                    scene = buildSingleScene(config, sid);

                    // Match single-snapshot behavior: attach phase annotations
                    // unless the dashboard scene already provides its own data layer.
                    const globalLayers = new SceneDataLayerSet({
                        layers: [
                            new SnapshotPhaseRegionsLayer({
                                isEnabled: true,
                                snapshotId: sid,
                                name: 'Snapshot Phases'
                            })
                        ],
                    });

                    const currentState: any = (scene as any).state || {};
                    if (!currentState.$data) {
                        scene.setState({ $data: globalLayers });
                    }

                    sceneCacheService.setScene(cacheKey, scene);
                }

                // Attach time range if provided
                if (timeRanges && timeRanges[idx]) {
                    scene.setState({ $timeRange: timeRanges[idx] });
                }

                return new SceneFlexItem({ width, body: scene });
            });

            return new EmbeddedScene({
                body: new SceneFlexLayout({ direction: 'row', children }),
            });
        },
    });
}
