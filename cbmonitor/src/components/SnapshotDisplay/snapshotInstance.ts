import { SceneAppPage, SceneRefreshPicker, SceneTimePicker, SceneTimeRange, EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneObjectUrlValues } from '@grafana/scenes';
import { dateTime } from '@grafana/data';
import { ROUTES } from '../../constants';
import { prefixRoute } from '../../utils/utils.routing';
import { getDashboardsForServices } from 'pages';
import { snapshotService } from '../../services/snapshotService';
import { locationService } from '@grafana/runtime';
import { SnapshotSearchScene } from '../../pages/SnapshotSearch';

// Custom SceneTimeRange that doesn't sync to URL
class NoUrlSyncTimeRange extends SceneTimeRange {
    public getUrlState(): SceneObjectUrlValues {
        // Return empty to prevent URL sync
        return {};
    }
}

// Create initial search tab to avoid flash of "not found" page
const initialSearchTab = new SceneAppPage({
    title: 'Search',
    url: prefixRoute(ROUTES.CBMonitor),
    routePath: '/',
    getScene: () => new EmbeddedScene({
        body: new SceneFlexLayout({
            direction: 'column',
            children: [
                new SceneFlexItem({
                    body: new SnapshotSearchScene({}),
                }),
            ],
        }),
    }),
});

// Create time range without URL sync, with basic default time range
const timeRange = new NoUrlSyncTimeRange({
    from: 'now-1h',
    to: 'now',
});

// This page is used to display the snapshot instance and its metrics
export const snapshotPage = new SceneAppPage({
    title: '',
    url: prefixRoute(ROUTES.CBMonitor),
    routePath: `${ROUTES.CBMonitor}/*`,
    hideFromBreadcrumbs: true,
    tabs: [initialSearchTab]
});

// Add activation handler to fetch and configure snapshot
snapshotPage.addActivationHandler(() => {

    // Function to load snapshot based on current URL
    const loadSnapshotFromUrl = () => {
        const params = locationService.getSearchObject();
        const snapshotId = params.snapshotId as string;

        if (!snapshotId) {
            // We didnt get a snapshotId in the URL - show search interface
            console.warn('No snapshotId found in URL');
            showSearchInterface();
            return;
        }

        // Fetch snapshot data
        const fetchSnapshot = async () => {
            try {
                // Check if we have cached data
                let snapshot = snapshotService.getStoredSnapshotData(snapshotId);

                if (!snapshot) {
                    snapshot = await snapshotService.getSnapshot(snapshotId);
                    snapshotService.storeSnapshotData(snapshotId, snapshot);
                }

                const { metadata } = snapshot;

                // Update time range from snapshot metadata FIRST (before updating tabs)
                // Update the time range using onTimeRangeChange to properly trigger all listeners
                timeRange.onTimeRangeChange({
                    from: dateTime(metadata.ts_start),
                    to: dateTime(metadata.ts_end),
                    raw: {
                        from: metadata.ts_start,
                        to: metadata.ts_end
                    }
                });

                // Update page title and subtitle with metadata
                snapshotPage.setState({
                    title: `Snapshot: ${snapshotId}`,
                    subTitle: `Services: ${metadata.services.join(', ')} | Nodes: ${metadata.nodes.length} | Buckets: ${metadata.buckets.length}`,
                    tabs: getDashboardsForServices(metadata.services, snapshotId),
                    $timeRange: timeRange,
                    controls: [
                        new SceneTimePicker({ isOnCanvas: true }),
                        new SceneRefreshPicker({
                            intervals: ['5s', '10s', '30s', '1m', '2m', '5m', '10m'],
                            isOnCanvas: false, // TODO: If cluster is "live", display this, otherwise hide
                        }),
                    ],
                });

            } catch (error) {
                console.error('Error loading snapshot:', error);
                const errorMessage = error instanceof Error ? error.message : 'Failed to load snapshot';
                // Show search interface with error message
                showSearchInterface(errorMessage);
            }
        };

        fetchSnapshot();
    };

    // Load snapshot immediately on mount
    loadSnapshotFromUrl();

    // Subscribe to URL changes to reload snapshot when snapshotId changes
    const urlSubscription = locationService.getHistory().listen(() => {
        console.log('URL changed, reloading snapshot');
        loadSnapshotFromUrl();
    });

    // Return deactivation handler
    return () => {
        console.log('SnapshotPage deactivation handler triggered');
        // Unsubscribe from URL changes
        urlSubscription();
    };
});

// Helper function to show search interface
function showSearchInterface(errorMessage?: string) {
    const searchTab = new SceneAppPage({
        title: 'Search',
        url: prefixRoute(ROUTES.CBMonitor),
        routePath: '/',
        getScene: () => new EmbeddedScene({
            body: new SceneFlexLayout({
                direction: 'column',
                children: [
                    new SceneFlexItem({
                        body: new SnapshotSearchScene({ errorMessage }),
                    }),
                ],
            }),
        }),
    });

    snapshotPage.setState({
        title: '',
        subTitle: errorMessage ? `Unable to load snapshot - ${errorMessage}` : '',
        tabs: [searchTab],
    });
}
