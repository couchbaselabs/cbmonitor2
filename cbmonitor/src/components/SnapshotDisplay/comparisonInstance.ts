import { SceneAppPage, EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneObjectBase, SceneObjectState, SceneComponentProps, SceneTimeRange, SceneTimePicker } from '@grafana/scenes';
import { dateTime, TimeOption } from '@grafana/data';
import { ROUTES } from '../../constants';
import { prefixRoute } from '../../utils/utils.routing';
import { snapshotService } from '../../services/snapshotService';
import { locationService } from '@grafana/runtime';
import React from 'react';
import { Alert } from '@grafana/ui';
import CompareHeader from './CompareHeader';
import { systemMetricsDashboard } from '../../dashboards/system';
import { kvMetricsDashboard } from '../../dashboards/kv';
import { indexMetricsDashboard } from '../../dashboards/index';
import { queryMetricsDashboard } from '../../dashboards/query';
import { ftsMetricsDashboard } from '../../dashboards/fts';
import { eventingMetricsDashboard } from '../../dashboards/eventing';
import { sgwMetricsDashboard } from '../../dashboards/sgw';
import { xdcrMetricsDashboard } from '../../dashboards/xdcr';
import { analyticsMetricsDashboard } from '../../dashboards/analytics';
import { clusterManagerMetricsDashboard } from '../../dashboards/clusterManager';
import { layoutService } from '../../services/layoutService';

// State interface for ComparisonStatusScene
interface ComparisonStatusSceneState extends SceneObjectState {
    message: string;
    status: 'success' | 'error' | 'info';
}

// Custom scene component to display comparison status
class ComparisonStatusScene extends SceneObjectBase<ComparisonStatusSceneState> {
    public static Component = ComparisonStatusRenderer;

    public constructor(message: string, status: 'success' | 'error' | 'info' = 'info') {
        super({
            message,
            status,
        });
    }
}

// Renderer for ComparisonStatusScene
function ComparisonStatusRenderer({ model }: SceneComponentProps<ComparisonStatusScene>) {
    const { message, status } = model.useState();

    const title = status === 'success' ? 'Comparison Ready' : status === 'error' ? 'Error' : 'Loading...';

    return React.createElement(
        Alert as any,
        { title, severity: status },
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'monospace' } }, message)
    );
}

// Initial placeholder page
const initialPlaceholderTab = new SceneAppPage({
    title: 'Compare Snapshots',
    url: prefixRoute(`${ROUTES.CBMonitor}/${ROUTES.Compare}`),
    routePath: '/',
    getScene: () => new EmbeddedScene({
        body: new SceneFlexLayout({
            direction: 'column',
            children: [
                new SceneFlexItem({
                    body: new ComparisonStatusScene('Please provide snapshot IDs in the URL', 'info') as any,
                }),
            ],
        }),
    }),
});

// This page is used to compare multiple snapshots
export const comparisonPage = new SceneAppPage({
    title: 'Compare Snapshots',
    url: prefixRoute(`${ROUTES.CBMonitor}/${ROUTES.Compare}`),
    routePath: `${ROUTES.CBMonitor}/${ROUTES.Compare}/*`,
    hideFromBreadcrumbs: false,
    tabs: [initialPlaceholderTab]
});

// Holds the last computed comparison context (snapshot IDs and common services)
let lastComparisonContext: { snapshotIds: string[]; commonServices: string[] } | null = null;

// Public getter for other modules to use when building dashboards
export function getComparisonContext() {
    return lastComparisonContext;
}

// Local non-URL-synced time ranges for left/right snapshots
class NoUrlSyncTimeRange extends SceneTimeRange {
    public getUrlState() { return {}; }
}

let timeRanges: NoUrlSyncTimeRange[] = [];

export function getComparisonTimeRanges() {
    return timeRanges;
}

// Add activation handler to fetch and validate snapshots
comparisonPage.addActivationHandler(() => {
    // Force single-panel-per-row layout while on compare page; restore on leave
    const previousLayout = layoutService.getLayout();
    if (previousLayout !== 'rows') {
        layoutService.setLayout('rows');
    }
    // Track currently loaded snapshot IDs to avoid reloading
    let currentLoadedSnapshotIds: string[] = [];

    // Function to load snapshots for comparison based on current URL
    const loadSnapshotsFromUrl = () => {
        const params = locationService.getSearchObject();
        
        // Get snapshot IDs from URL - support 'snapshot' parameter (can be array)
        let snapshotIds: string[] = [];
        
        if (Array.isArray(params.snapshot)) {
            snapshotIds = params.snapshot as string[];
        } else if (typeof params.snapshot === 'string') {
            snapshotIds = [params.snapshot];
        }

        // Filter out empty strings
        snapshotIds = snapshotIds.filter(id => id && id.trim().length > 0);

        // Validate we have between 2 and 6 snapshots
        if (snapshotIds.length < 2 || snapshotIds.length > 6) {
            showStatusMessage(
                `Please provide between 2 and 6 snapshot IDs. Found: ${snapshotIds.length}. Example: /a/cbmonitor/cbmonitor/compare?snapshot=id1&snapshot=id2[&snapshot=id3...]`,
                'error'
            );
            currentLoadedSnapshotIds = [];
            return;
        }

        // Check if we need to reload (different set of snapshots)
        const snapshotsChanged = snapshotIds.length !== currentLoadedSnapshotIds.length ||
            !snapshotIds.every((id, idx) => id === currentLoadedSnapshotIds[idx]);

        if (!snapshotsChanged) {
            return;
        }

        // Show loading message
        showStatusMessage(`Loading ${snapshotIds.length} snapshots...`, 'info');

        // Fetch snapshots data
        const fetchSnapshots = async () => {
            try {
                // Update currently loaded snapshots
                currentLoadedSnapshotIds = snapshotIds;

                // Fetch all snapshots
                const snapshots = await Promise.all(
                    snapshotIds.map(async (id) => {
                        let snapshot = snapshotService.getStoredSnapshotData(id);
                        if (!snapshot) {
                            snapshot = await snapshotService.getSnapshot(id);
                            snapshotService.storeSnapshotData(id, snapshot);
                        }
                        return { id, snapshot };
                    })
                );

                // Compute common services (case-insensitive), preserving a canonical order
                const svcOrder = ['system', 'kv', 'index', 'query', 'fts', 'eventing', 'sgw', 'sync-gateway', 'xdcr', 'analytics', 'cbas', 'cluster_manager'];
                // Treat aliases
                const normalize = (svc: string) => {
                    if (svc === 'n1ql') return 'query';
                    if (svc === 'sync-gateway') return 'sgw';
                    if (svc === 'cbas') return 'analytics';
                    return svc;
                };

                const normalizedSets = snapshots.map(s => new Set(
                    s.snapshot.metadata.services.map((svc: string) => normalize(svc.toLowerCase()))
                ));

                const commonServices = svcOrder.filter((svc) => {
                    const nsvc = normalize(svc);
                    return normalizedSets.every(set => set.has(nsvc));
                })
                // remove duplicates introduced by aliases and non-canonical names
                .filter((v, i, arr) => arr.indexOf(v) === i)
                // finally, drop synthetic entries not used for dashboards except 'system'
                .filter((svc) => ['system','kv','index','query','fts','eventing','sgw','xdcr','analytics','cluster_manager'].includes(svc));

                // Build success message with snapshot info
                const snapshotInfo = snapshots.map((s, idx) => {
                    const meta = s.snapshot.metadata;
                    return `${idx + 1}. Snapshot ID: ${s.id}\n   Services: ${meta.services.join(', ')}\n   Time Range: ${meta.ts_start} to ${meta.ts_end}`;
                }).join('\n\n');

                // Persist comparison context for later use when building dashboards
                lastComparisonContext = { snapshotIds: [...snapshotIds], commonServices };

                const successMessage = `Successfully loaded ${snapshots.length} snapshots:\n\n${snapshotInfo}\n\nCommon services (${commonServices.length}): ${commonServices.join(', ') || 'none'}\n\n✓ All snapshots validated and ready for comparison!`;

                showStatusMessage(successMessage, 'success');

                // Prepare header + pickers; final render happens below together with tabs
                // Create per-snapshot, non-URL-synced time ranges and pickers
                timeRanges = snapshots.map(() => new NoUrlSyncTimeRange({ from: 'now-15m', to: 'now' }));
                timeRanges.forEach((tr, idx) => {
                    const meta = snapshots[idx].snapshot.metadata;
                    tr.onTimeRangeChange({
                        from: dateTime(meta.ts_start),
                        to: dateTime(meta.ts_end),
                        raw: { from: meta.ts_start, to: meta.ts_end }
                    });
                });

                const pickerScenes = snapshots.map((s, idx) => {
                    const quickRanges: TimeOption[] = [
                        { from: s.snapshot.metadata.ts_start, to: s.snapshot.metadata.ts_end, display: 'Full Snapshot Range' }
                    ];
                    if (s.snapshot.metadata.phases && s.snapshot.metadata.phases.length > 0) {
                        for (const p of s.snapshot.metadata.phases) {
                            quickRanges.push({ from: p.ts_start, to: p.ts_end, display: `Phase: ${p.label}` });
                        }
                    }
                    const picker = new SceneTimePicker({ isOnCanvas: true, $timeRange: timeRanges[idx], quickRanges });
                    return new EmbeddedScene({
                        body: new SceneFlexLayout({ direction: 'column', children: [new SceneFlexItem({ body: picker })] }),
                    });
                });

                // Build tabs from common services without pulling dashboards yet
                const tabs = buildComparisonServiceTabs(commonServices);

                // Render header and inject pickers under each card via CompareHeader, then set tabs
                comparisonPage.setState({
                    renderTitle: () => React.createElement(CompareHeader as any, {
                        items: snapshots.map((s, idx) => ({
                            id: s.id,
                            meta: s.snapshot.metadata,
                            title: `Snapshot ${String.fromCharCode(65 + idx)}`,
                            renderPickerScene: () => React.createElement((pickerScenes[idx] as any).Component, { model: pickerScenes[idx] }),
                        })),
                        commonServices,
                    }),
                    // Clear controls to avoid duplicate pickers above tabs
                    controls: [],
                    tabs,
                });

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Failed to load snapshots';
                showStatusMessage(`Error loading snapshots: ${errorMessage}`, 'error');
                currentLoadedSnapshotIds = [];
                lastComparisonContext = null;
            }
        };

        fetchSnapshots();
    };

    // Load snapshots immediately on mount
    loadSnapshotsFromUrl();

    // Subscribe to URL changes to reload snapshots when parameters change
    const urlSubscription = locationService.getHistory().listen(() => {
        loadSnapshotsFromUrl();
    });

    // Return deactivation handler
    return () => {
        console.log('ComparisonPage deactivation handler triggered');
        urlSubscription();
        // Restore previous layout mode when leaving compare page
        if (layoutService.getLayout() !== previousLayout) {
            layoutService.setLayout(previousLayout);
        }
    };
});

// Helper: Build comparison service tabs with placeholder side-by-side scenes
function buildComparisonServiceTabs(services: string[]): SceneAppPage[] {
    const svcOrder: Array<{ key: string; title: string; segment: string }> = [
        { key: 'system', title: 'System Metrics', segment: '' },
        { key: 'kv', title: 'KV Metrics', segment: 'kv' },
        { key: 'index', title: 'Index Metrics', segment: 'index' },
        { key: 'query', title: 'Query Engine Metrics', segment: 'query' },
        { key: 'fts', title: 'FTS Metrics', segment: 'fts' },
        { key: 'eventing', title: 'Eventing Metrics', segment: 'eventing' },
        { key: 'sgw', title: 'Sync Gateway Metrics', segment: 'sgw' },
        { key: 'xdcr', title: 'XDCR Metrics', segment: 'xdcr' },
        { key: 'analytics', title: 'Analytics Metrics', segment: 'analytics' },
        { key: 'cluster_manager', title: 'Cluster Manager Metrics', segment: 'cluster-manager' },
    ];

    const builders: Record<string, (snapshotId: string) => EmbeddedScene> = {
        system: systemMetricsDashboard,
        kv: kvMetricsDashboard,
        index: indexMetricsDashboard,
        query: queryMetricsDashboard,
        fts: ftsMetricsDashboard,
        eventing: eventingMetricsDashboard,
        sgw: sgwMetricsDashboard,
        xdcr: xdcrMetricsDashboard,
        analytics: analyticsMetricsDashboard,
        cluster_manager: clusterManagerMetricsDashboard,
    };

    const normalized = new Set(services.map((s) => s.toLowerCase()));

    const pages: SceneAppPage[] = [];
    for (const svc of svcOrder) {
        const alwaysInclude = svc.key === 'system' || svc.key === 'cluster_manager';
        if (!alwaysInclude && !normalized.has(svc.key)) { continue; }

        const urlPath = svc.segment ? `${ROUTES.CBMonitor}/${ROUTES.Compare}/${svc.segment}` : `${ROUTES.CBMonitor}/${ROUTES.Compare}`;
        const routePath = svc.segment ? `/${svc.segment}` : '/';

        const page = new SceneAppPage({
            title: svc.title,
            url: prefixRoute(urlPath),
            routePath,
            getScene: () => {
                const ctx = getComparisonContext();
                const ranges = getComparisonTimeRanges();
                if (!ctx || !ctx.snapshotIds || ctx.snapshotIds.length < 2 || !ranges || ranges.length !== ctx.snapshotIds.length) {
                    return new EmbeddedScene({
                        body: new SceneFlexLayout({
                            direction: 'column',
                            children: [
                                new SceneFlexItem({ body: new ComparisonStatusScene('Comparison context not ready. Reload the page.', 'error') as any }),
                            ],
                        }),
                    });
                }

                const builder = builders[svc.key];
                if (!builder) {
                    return new EmbeddedScene({
                        body: new SceneFlexLayout({
                            direction: 'column',
                            children: [
                                new SceneFlexItem({ body: new ComparisonStatusScene(`No builder for service: ${svc.key}`, 'error') as any }),
                            ],
                        }),
                    });
                }

                const count = ctx.snapshotIds.length;
                const width = `${(100 / count).toFixed(2)}%`;
                const children = ctx.snapshotIds.map((sid, idx) => {
                    const scene = builder(sid);
                    scene.setState({ $timeRange: ranges[idx] });
                    return new SceneFlexItem({ width, body: scene });
                });

                return new EmbeddedScene({
                    body: new SceneFlexLayout({ direction: 'row', children }),
                });
            },
        });
        pages.push(page);
    }


    return pages;
}

// Helper function to show status message
function showStatusMessage(message: string, status: 'success' | 'error' | 'info') {
    const statusTab = new SceneAppPage({
        title: 'Status',
        url: prefixRoute(`${ROUTES.CBMonitor}/${ROUTES.Compare}`),
        routePath: '/',
        getScene: () => new EmbeddedScene({
            body: new SceneFlexLayout({
                direction: 'column',
                children: [
                    new SceneFlexItem({
                        body: new ComparisonStatusScene(message, status) as any,
                    }),
                ],
            }),
        }),
    });

    comparisonPage.setState({
        title: 'Compare Snapshots',
        subTitle: status === 'error' ? 'Error occurred' : status === 'success' ? 'Ready' : 'Loading',
        tabs: [statusTab],
    });
}
