import { SceneAppPage, EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneTimeRange, SceneDataLayerSet } from '@grafana/scenes';
import { prefixRoute } from '../utils/utils.routing';
import { getServiceConfigs, getServiceConfig, type ServiceConfig } from '../config/services';
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
     * Optional snapshot-declared custom panels. When set on a single-mode
     * build, an extra "Custom" tab is appended after the regular services.
     * Ignored in comparison mode (the custom-metric set may differ between
     * snapshots, so we don't attempt to render it side-by-side).
     */
    customPanels?: CustomPanelsConfig;
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
    const { snapshotIds, services, mode, routePrefix, timeRanges, overlapMode, overlapEndTimeSeconds, urlBase, customPanels } = options;

    if (mode === 'single' && snapshotIds.length !== 1) {
        throw new Error('Single mode requires exactly one snapshot ID');
    }

    if (mode === 'comparison' && snapshotIds.length < 2) {
        throw new Error('Comparison mode requires at least 2 snapshot IDs');
    }

    if (mode === 'comparison' && timeRanges && timeRanges.length !== snapshotIds.length) {
        throw new Error('Number of time ranges must match number of snapshots');
    }

    const serviceConfigs = getServiceConfigs(services);
    const pages: SceneAppPage[] = [];

    for (const config of serviceConfigs) {
        if (mode === 'single') {
            pages.push(buildSingleSnapshotPage(config.key, snapshotIds[0], routePrefix, urlBase));
        } else {
            pages.push(buildComparisonPage(config.key, snapshotIds, routePrefix, timeRanges, overlapMode, overlapEndTimeSeconds));
        }
    }

    if (mode === 'single' && customPanels) {
        const customTab = buildCustomPanelsPage(snapshotIds[0], routePrefix, customPanels, urlBase);
        if (customTab) {
            pages.push(customTab);
        }
    }

    return pages;
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
 * Build the optional "Custom" tab from a snapshot's custom_panels config.
 * Returns null when no metric names have been resolved yet (snapshot
 * viewer pre-fetches them before the first build, so this guards against
 * a misordered call rather than expecting a real cache miss).
 */
function buildCustomPanelsPage(
    snapshotId: string,
    routePrefix: string,
    customPanels: CustomPanelsConfig,
    urlBase?: string,
): SceneAppPage | null {
    const discovered = getCachedCustomMetricNames(snapshotId, customPanels.match);
    if (!discovered || discovered.names.length === 0) {
        return null;
    }

    const title = customPanels.title?.trim() || 'Custom';
    const segment = 'custom';
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
                serviceKey: 'custom',
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
