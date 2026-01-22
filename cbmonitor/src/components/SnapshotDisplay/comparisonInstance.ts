import { SceneAppPage, EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneObjectBase, SceneObjectState, SceneComponentProps, SceneTimeRange, SceneTimePicker } from '@grafana/scenes';
import { dateTime, TimeOption } from '@grafana/data';
import { ROUTES } from '../../constants';
import { prefixRoute } from '../../utils/utils.routing';
import { snapshotService } from '../../services/snapshotService';
import { locationService } from '@grafana/runtime';
import React from 'react';
import { Alert } from '@grafana/ui';
import CompareHeader from './CompareHeader';

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

let leftTimeRange: NoUrlSyncTimeRange | null = null;
let rightTimeRange: NoUrlSyncTimeRange | null = null;

export function getComparisonTimeRanges() {
    return { leftTimeRange, rightTimeRange };
}

// Add activation handler to fetch and validate snapshots
comparisonPage.addActivationHandler(() => {
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

        // Validate we have exactly 2 snapshots
        if (snapshotIds.length !== 2) {
            showStatusMessage(
                `Please provide exactly 2 snapshot IDs. Found: ${snapshotIds.length}. Example URL: /a/cbmonitor/cbmonitor/compare?snapshot=id1&snapshot=id2`,
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
                const servicesA = new Set(snapshots[0].snapshot.metadata.services.map((s: string) => s.toLowerCase()));
                const servicesB = new Set(snapshots[1].snapshot.metadata.services.map((s: string) => s.toLowerCase()));

                // Treat aliases
                const normalize = (svc: string) => {
                    if (svc === 'n1ql') return 'query';
                    if (svc === 'sync-gateway') return 'sgw';
                    if (svc === 'cbas') return 'analytics';
                    return svc;
                };

                const normA = new Set(Array.from(servicesA).map(normalize));
                const normB = new Set(Array.from(servicesB).map(normalize));

                const commonServices = svcOrder.filter((svc) => {
                    const nsvc = normalize(svc);
                    return normA.has(nsvc) && normB.has(nsvc);
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
                const [left, right] = snapshots;

                // Create dual, non-URL-synced time ranges and pickers
                leftTimeRange = new NoUrlSyncTimeRange({ from: 'now-15m', to: 'now' });
                rightTimeRange = new NoUrlSyncTimeRange({ from: 'now-15m', to: 'now' });

                // Initialize to each snapshot's full range, triggering listeners
                leftTimeRange.onTimeRangeChange({
                    from: dateTime(left.snapshot.metadata.ts_start),
                    to: dateTime(left.snapshot.metadata.ts_end),
                    raw: { from: left.snapshot.metadata.ts_start, to: left.snapshot.metadata.ts_end }
                });

                rightTimeRange.onTimeRangeChange({
                    from: dateTime(right.snapshot.metadata.ts_start),
                    to: dateTime(right.snapshot.metadata.ts_end),
                    raw: { from: right.snapshot.metadata.ts_start, to: right.snapshot.metadata.ts_end }
                });

                // Build quick ranges for each side: full range + phases
                const quickRangesLeft: TimeOption[] = [
                    { from: left.snapshot.metadata.ts_start, to: left.snapshot.metadata.ts_end, display: 'Full Snapshot Range' }
                ];
                const quickRangesRight: TimeOption[] = [
                    { from: right.snapshot.metadata.ts_start, to: right.snapshot.metadata.ts_end, display: 'Full Snapshot Range' }
                ];

                if (left.snapshot.metadata.phases && left.snapshot.metadata.phases.length > 0) {
                    for (const p of left.snapshot.metadata.phases) {
                        quickRangesLeft.push({ from: p.ts_start, to: p.ts_end, display: `Phase: ${p.label}` });
                    }
                }

                if (right.snapshot.metadata.phases && right.snapshot.metadata.phases.length > 0) {
                    for (const p of right.snapshot.metadata.phases) {
                        quickRangesRight.push({ from: p.ts_start, to: p.ts_end, display: `Phase: ${p.label}` });
                    }
                }

                // Instantiate time picker scene objects for left/right
                const leftPicker = new SceneTimePicker({ isOnCanvas: true, $timeRange: leftTimeRange, quickRanges: quickRangesLeft });
                const rightPicker = new SceneTimePicker({ isOnCanvas: true, $timeRange: rightTimeRange, quickRanges: quickRangesRight });

                // Create small scenes to host each picker inside the header cards (ensures Scenes context)
                const leftPickerScene = new EmbeddedScene({
                    body: new SceneFlexLayout({
                        direction: 'column',
                        children: [new SceneFlexItem({ body: leftPicker })],
                    }),
                });
                const rightPickerScene = new EmbeddedScene({
                    body: new SceneFlexLayout({
                        direction: 'column',
                        children: [new SceneFlexItem({ body: rightPicker })],
                    }),
                });

                // Build tabs from common services without pulling dashboards yet
                const tabs = buildComparisonServiceTabs(commonServices);

                // Render header and inject pickers under each card via CompareHeader, then set tabs
                comparisonPage.setState({
                    renderTitle: () => React.createElement(CompareHeader as any, {
                        leftId: left.id,
                        rightId: right.id,
                        leftMeta: left.snapshot.metadata,
                        rightMeta: right.snapshot.metadata,
                        commonServices,
                        renderLeftPickerScene: () => React.createElement((leftPickerScene as any).Component, { model: leftPickerScene }),
                        renderRightPickerScene: () => React.createElement((rightPickerScene as any).Component, { model: rightPickerScene }),
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
            getScene: () => new EmbeddedScene({
                body: new SceneFlexLayout({
                    direction: 'row',
                    children: [
                        new SceneFlexItem({
                            width: '50%',
                            body: new ComparisonStatusScene('Left snapshot view will appear here (Phase 4)', 'info') as any,
                        }),
                        new SceneFlexItem({
                            width: '50%',
                            body: new ComparisonStatusScene('Right snapshot view will appear here (Phase 4)', 'info') as any,
                        }),
                    ],
                }),
            }),
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
