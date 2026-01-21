import { SceneAppPage, EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneObjectBase, SceneObjectState, SceneComponentProps } from '@grafana/scenes';
import { ROUTES } from '../../constants';
import { prefixRoute } from '../../utils/utils.routing';
import { snapshotService } from '../../services/snapshotService';
import { locationService } from '@grafana/runtime';
import React from 'react';
import { Alert } from '@grafana/ui';

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

                // Build success message with snapshot info
                const snapshotInfo = snapshots.map((s, idx) => {
                    const meta = s.snapshot.metadata;
                    return `${idx + 1}. Snapshot ID: ${s.id}\n   Services: ${meta.services.join(', ')}\n   Time Range: ${meta.ts_start} to ${meta.ts_end}`;
                }).join('\n\n');

                const successMessage = `Successfully loaded ${snapshots.length} snapshots:\n\n${snapshotInfo}\n\n✓ All snapshots validated and ready for comparison!`;

                showStatusMessage(successMessage, 'success');

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Failed to load snapshots';
                showStatusMessage(`Error loading snapshots: ${errorMessage}`, 'error');
                currentLoadedSnapshotIds = [];
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
