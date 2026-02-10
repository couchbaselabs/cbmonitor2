import { SceneAppPage, EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneTimeRange, SceneDataLayerSet } from '@grafana/scenes';
import { prefixRoute } from '../utils/utils.routing';
import { getServiceConfigs, getServiceConfig } from '../config/services';
import { sceneCacheService } from './sceneCache';
import { SnapshotPhaseRegionsLayer } from '../layers/SnapshotPhaseRegionsLayer';
import { StatusScene } from '../components/SceneComponents/StatusScene';
import { PlaceholderScene } from '../components/SceneComponents/PlaceholderScene';

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
    const { snapshotIds, services, mode, routePrefix, timeRanges, overlapMode } = options;

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
            pages.push(buildSingleSnapshotPage(config.key, snapshotIds[0], routePrefix));
        } else {
            pages.push(buildComparisonPage(config.key, snapshotIds, routePrefix, timeRanges, overlapMode));
        }
    }

    return pages;
}

/**
 * Build a page for a single snapshot and service.
 * Uses caching to avoid recreating scenes on tab switches.
 */
function buildSingleSnapshotPage(
    serviceKey: string,
    snapshotId: string,
    routePrefix: string
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
            const cacheKey = {
                snapshotId,
                serviceKey,
                dashboardType: config.segment || 'system'
            };

            // Check cache first
            if (!sceneCacheService.hasScene(cacheKey)) {
                // Create and cache the scene
                const scene = config.dashboardBuilder(snapshotId);
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
 * Build a comparison page for multiple snapshots and a service.
 * Shows side-by-side views or overlap mode placeholders.
 */
function buildComparisonPage(
    serviceKey: string,
    snapshotIds: string[],
    routePrefix: string,
    timeRanges?: SceneTimeRange[],
    overlapMode?: boolean
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

            // If overlap mode is enabled, show placeholder
            if (overlapMode) {
                return new EmbeddedScene({
                    body: new SceneFlexLayout({
                        direction: 'row',
                        children: [
                            new SceneFlexItem({
                                body: new PlaceholderScene({ text: 'Overlap view coming soon' }) as any
                            })
                        ],
                    }),
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
                    scene = config.dashboardBuilder(sid);
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
