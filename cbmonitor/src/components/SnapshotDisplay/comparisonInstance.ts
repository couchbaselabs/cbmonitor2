import { SceneAppPage, EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneObjectBase, SceneObjectState, SceneComponentProps } from '@grafana/scenes';
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

                // Phase 1: Render comparison header above tabs with snapshot details
                const [left, right] = snapshots;
                comparisonPage.setState({
                    renderTitle: () => React.createElement(CompareHeader as any, {
                        leftId: left.id,
                        rightId: right.id,
                        leftMeta: left.snapshot.metadata,
                        rightMeta: right.snapshot.metadata,
                        commonServices,
                    }),
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
