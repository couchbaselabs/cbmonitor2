import { SceneAppPage, SceneTimePicker, SceneTimeRange, EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneObjectUrlValues, SceneRefreshPicker, SceneObjectBase, SceneObjectState, SceneComponentProps } from '@grafana/scenes';
import { dateTime, TimeOption } from '@grafana/data';
import { ROUTES } from '../../constants';
import { prefixRoute } from '../../utils/utils.routing';
import { getDashboardsForServices, clearSceneCache } from 'pages';
import { snapshotService } from '../../services/snapshotService';
import { locationService } from '@grafana/runtime';
import { SnapshotSearchScene } from '../../pages/SnapshotSearch';
import { FormatMetadataSummary } from './metadataSummary';
import { Phase } from '../../types/snapshot';
import { LayoutToggle } from '../LayoutToggle/LayoutToggle';
import React from 'react';

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

// Simple scene to render a Hello World message
interface HelloWorldState extends SceneObjectState { message: string }
class HelloWorldScene extends SceneObjectBase<HelloWorldState> {
    public static Component = HelloWorldRenderer;
    public constructor(message: string = 'Hello world') {
        super({ message });
    }
}

function HelloWorldRenderer({ model }: SceneComponentProps<HelloWorldScene>) {
    const { message } = model.useState();
    return React.createElement('div', { style: { fontSize: '18px', padding: '16px' } }, message);
}

// Initial compare tab with Hello World
const initialCompareTab = new SceneAppPage({
    title: 'Compare',
    url: prefixRoute(`${ROUTES.CBMonitor}/compare`),
    routePath: '/compare',
    getScene: () => new EmbeddedScene({
        body: new SceneFlexLayout({
            direction: 'column',
            children: [
                new SceneFlexItem({
                    body: new HelloWorldScene('Hello world'),
                }),
            ],
        }),
    }),
});

// Create time range without URL sync, with basic default time range
const timeRange = new NoUrlSyncTimeRange({
    from: 'now-15m',
    to: 'now',
});

// This page is used to display the snapshot instance and its metrics
export const snapshotPage = new SceneAppPage({
    title: '',
    url: prefixRoute(ROUTES.CBMonitor),
    routePath: `${ROUTES.CBMonitor}/*`,
    hideFromBreadcrumbs: true,
    tabs: [initialSearchTab, initialCompareTab]
});

// Add activation handler to fetch and configure snapshot
snapshotPage.addActivationHandler(() => {
    // Variable to track time range subscription for cleanup
    let timeRangeSubscription: { unsubscribe: () => void } | null = null;
    // Track currently loaded snapshot to avoid reloading on tab switches
    let currentLoadedSnapshotId: string | null = null;

    // Function to load snapshot based on current URL
    const loadSnapshotFromUrl = () => {
        const params = locationService.getSearchObject();
        const snapshotId = params.snapshotId as string;

        if (!snapshotId) {
            // We didnt get a snapshotId in the URL - show search interface
            showSearchInterface();
            currentLoadedSnapshotId = null;
            return;
        }

        // Skip if this snapshot is already loaded (happens during tab switches)
        if (currentLoadedSnapshotId === snapshotId) {
            return;
        }

        // Fetch snapshot data
        const fetchSnapshot = async () => {
            try {
                // Clear scene cache when loading a different snapshot
                if (currentLoadedSnapshotId !== null && currentLoadedSnapshotId !== snapshotId) {
                    clearSceneCache();
                }

                // Update the currently loaded snapshot
                currentLoadedSnapshotId = snapshotId;

                // Check if we have cached data
                let snapshot = snapshotService.getStoredSnapshotData(snapshotId);

                if (!snapshot) {
                    snapshot = await snapshotService.getSnapshot(snapshotId);
                    snapshotService.storeSnapshotData(snapshotId, snapshot);
                }

                const { metadata } = snapshot;

                // Check if there's a phase parameter in the URL
                const urlPhase = params.phase as string;
                let initialFrom = metadata.ts_start;
                let initialTo = metadata.ts_end;

                // If a phase is specified in URL, use that phase's time range
                if (urlPhase && metadata.phases) {
                    const selectedPhase = metadata.phases.find((p: Phase) => p.label === urlPhase);
                    if (selectedPhase) {
                        initialFrom = selectedPhase.ts_start;
                        initialTo = selectedPhase.ts_end;
                    }
                }

                // Update time range from snapshot metadata or phase
                // Update the time range using onTimeRangeChange to properly trigger all listeners
                timeRange.onTimeRangeChange({
                    from: dateTime(initialFrom),
                    to: dateTime(initialTo),
                    raw: {
                        from: initialFrom,
                        to: initialTo
                    }
                });

                // Handler for when time range changes - update URL with phase if applicable
                const handleTimeRangeChange = () => {
                    const currentTimeRange = timeRange.state;
                    const currentFrom = currentTimeRange.value.raw.from?.toString();
                    const currentTo = currentTimeRange.value.raw.to?.toString();

                    // Check if current time range matches a phase
                    if (metadata.phases) {
                        const matchingPhase = metadata.phases.find((p: Phase) => {
                            const phaseMatches = p.ts_start === currentFrom && p.ts_end === currentTo;
                            return phaseMatches;
                        });

                        if (matchingPhase) {
                            // Update URL with phase parameter
                            locationService.partial({ phase: matchingPhase.label }, true);
                        } else if (metadata.ts_start === currentFrom &&
                            metadata.ts_end === currentTo) {
                            // Full range selected - remove phase parameter
                            locationService.partial({ phase: null }, true);
                        }
                    }
                };

                // Clean up previous subscription if it exists
                if (timeRangeSubscription) {
                    timeRangeSubscription.unsubscribe();
                }

                // Subscribe to time range changes
                timeRangeSubscription = timeRange.subscribeToState((state) => {
                    handleTimeRangeChange();
                });

                // Build quick ranges: start with full snapshot range, then add phases if any
                const quickRanges: TimeOption[] = [];

                // Add full snapshot range as first option
                quickRanges.push({
                    from: metadata.ts_start,
                    to: metadata.ts_end,
                    display: 'Full Snapshot Range',
                });

                // Add phase ranges
                if (metadata.phases && metadata.phases.length > 0) {
                    metadata.phases.forEach((phase: Phase) => {
                        quickRanges.push({
                            from: phase.ts_start,
                            to: phase.ts_end,
                            display: `Phase: ${phase.label}`,
                        });
                    });
                }

                // Handler for layout change - regenerate tabs with new layout
                const handleLayoutChange = () => {
                    // Clear scene cache so scenes are recreated with new layout
                    clearSceneCache();
                    // Regenerate tabs with current services and snapshotId
                    snapshotPage.setState({
                        tabs: getDashboardsForServices(metadata.services, snapshotId),
                    });
                };

                // Create controls array with time picker (with quick ranges) and layout toggle
                const controls: any[] = [
                    new SceneTimePicker({
                        isOnCanvas: true,
                        quickRanges: quickRanges,
                    })
                ];

                // If we have active snapshot, display the refresh picker before the layout toggle
                if (metadata.ts_end && metadata.ts_end.startsWith("now")) {
                    controls.push(new SceneRefreshPicker({
                        intervals: ['5s', '10s', '30s', '1m', '2m', '5m', '10m'],
                        isOnCanvas: true
                    }));
                }

                // Add the layout toggle to the controls
                controls.push(new LayoutToggle({
                    onLayoutChange: handleLayoutChange,
                }));
                // Update page title and subtitle with metadata
                snapshotPage.setState({
                    title: "",
                    tabs: getDashboardsForServices(metadata.services, snapshotId),
                    $timeRange: timeRange,
                    controls: controls,
                    renderTitle: () => {
                        return FormatMetadataSummary({
                            metadata
                        });
                    },
                });

            } catch (error) {
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
        loadSnapshotFromUrl();
    });

    // Return deactivation handler
    return () => {
        console.log('SnapshotPage deactivation handler triggered');
        // Unsubscribe from URL changes
        urlSubscription();
        // Unsubscribe from time range changes
        if (timeRangeSubscription) {
            timeRangeSubscription.unsubscribe();
        }
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

    const compareTab = new SceneAppPage({
        title: 'Compare',
        url: prefixRoute(`${ROUTES.CBMonitor}/compare`),
        routePath: '/compare',
        getScene: () => new EmbeddedScene({
            body: new SceneFlexLayout({
                direction: 'column',
                children: [
                    new SceneFlexItem({ body: new HelloWorldScene('Hello world') }),
                ],
            }),
        }),
    });

    snapshotPage.setState({
        title: '',
        subTitle: errorMessage ? `Unable to load snapshot - ${errorMessage}` : '',
        tabs: [searchTab, compareTab],
    });
}
