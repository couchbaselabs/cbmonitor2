import { SceneAppPage, EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneTimePicker } from '@grafana/scenes';
import { dateTime } from '@grafana/data';
import { ROUTES, prefixRoute, ROUTE_PATHS } from '../../utils/utils.routing';
import { locationService } from '@grafana/runtime';
import React from 'react';
import { Button } from '@grafana/ui';
import CompareHeader from './CompareHeader';
import { layoutService } from '../../services/layoutService';
import { createNoUrlSyncTimeRange, buildQuickRanges, syncTimeRangesToPhase, syncTimeRangesToFullRange, NoUrlSyncTimeRange } from '../../utils/timeRange';
import { loadSnapshots, findCommonServicesInSnapshots, findCommonPhasesInSnapshots, formatSnapshotInfo } from '../../services/snapshotLoader';
import { sceneCacheService } from '../../services/sceneCache';
import { buildServiceTabs } from '../../services/pageBuilder';
import { StatusScene } from '../SceneComponents/StatusScene';
import { InputScene } from '../SceneComponents/InputScene';

// Global overlap mode (when true, hide columns and show placeholders)
let overlapMode = false;
function isOverlapModeEnabled() {
    return overlapMode;
}

function invalidateComparisonTabs() {
    const ctx = getComparisonContext();
    if (ctx && ctx.commonServices) {
        const tabs = buildServiceTabs({
            snapshotIds: ctx.snapshotIds,
            services: ctx.commonServices,
            mode: 'comparison',
            routePrefix: ROUTES.Compare,
            timeRanges: getComparisonTimeRanges(),
            overlapMode: isOverlapModeEnabled()
        });
        comparisonPage.setState({ tabs });
    }
}

function setOverlapMode(value: boolean) {
    overlapMode = value;
    invalidateComparisonTabs();
}

// Local header row showing Ready + Overlap button
function CompareTopBar() {
    const [overlap, setOverlap] = React.useState(isOverlapModeEnabled());
    const onToggle = () => {
        setOverlap((prev) => {
            const next = !prev;
            setOverlapMode(next);
            return next;
        });
    };
    return React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
    },
        React.createElement('span', { style: { color: '#9CA3AF', fontSize: 12 } }, 'Ready'),
        React.createElement((Button as any), {
            variant: 'secondary',
            size: 'sm',
            onClick: onToggle,
            style: overlap ? { background: '#065f46', borderColor: '#065f46', color: '#E5E7EB' } : undefined
        }, 'Overlap')
    );
}

// This page is used to compare multiple snapshots
export const comparisonPage = new SceneAppPage({
    title: 'Compare Snapshots',
    url: prefixRoute(ROUTE_PATHS.compare()),
    routePath: `${ROUTES.Compare}/*`,
    getScene: () => new EmbeddedScene({
        body: new SceneFlexLayout({
            direction: 'column',
            children: [
                new SceneFlexItem({
                    body: new InputScene({
                        mode: 'multiple',
                        minInputs: 2,
                        maxInputs: 6,
                        placeholder: 'Snapshot ID',
                        submitLabel: 'Compare',
                        errorMessage: 'Provide 2 to 6 snapshot IDs to compare.'
                    }) as any,
                }),
            ],
        }),
    }),
});

// Holds the last computed comparison context (snapshot IDs and common services)
let lastComparisonContext: { snapshotIds: string[]; commonServices: string[]; commonPhases: string[] } | null = null;

// Public getter for other modules to use when building dashboards
export function getComparisonContext() {
    return lastComparisonContext;
}

// Local non-URL-synced time ranges for snapshots
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

        // When snapshot count is invalid, show input page instead of error
        if (snapshotIds.length < 2 || snapshotIds.length > 6) {
            showCompareInput(`Found ${snapshotIds.length}. Enter 2 to 6 IDs to proceed.`);
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

                // Invalidate cached scenes when snapshot set changes
                sceneCacheService.clearAll();

                // Fetch all snapshots using unified loader
                const snapshots = await loadSnapshots(snapshotIds);

                // Find common services and phases using utility functions
                const commonServices = findCommonServicesInSnapshots(snapshots);
                const commonPhases = findCommonPhasesInSnapshots(snapshots);

                // Build success message with snapshot info
                const snapshotInfo = formatSnapshotInfo(snapshots);

                // Persist comparison context for later use when building dashboards
                lastComparisonContext = { snapshotIds: [...snapshotIds], commonServices, commonPhases };

                const successMessage = `Successfully loaded ${snapshots.length} snapshots:\n\n${snapshotInfo}\n\nCommon services (${commonServices.length}): ${commonServices.join(', ') || 'none'}\nCommon phases (${commonPhases.length}): ${commonPhases.join(', ') || 'none'}\n\n✓ All snapshots validated and ready for comparison!`;

                showStatusMessage(successMessage, 'success');

                // Prepare header + pickers; final render happens below together with tabs
                // Create per-snapshot, non-URL-synced time ranges and pickers
                timeRanges = snapshots.map(() => createNoUrlSyncTimeRange());
                timeRanges.forEach((tr, idx) => {
                    const meta = snapshots[idx].metadata;
                    tr.onTimeRangeChange({
                        from: dateTime(meta.ts_start),
                        to: dateTime(meta.ts_end),
                        raw: { from: meta.ts_start, to: meta.ts_end }
                    });
                });

                const pickerScenes = snapshots.map((s, idx) => {
                    const quickRanges = buildQuickRanges(s.metadata);
                    const picker = new SceneTimePicker({ isOnCanvas: true, $timeRange: timeRanges[idx], quickRanges });
                    return new EmbeddedScene({
                        body: new SceneFlexLayout({ direction: 'column', children: [new SceneFlexItem({ body: picker })] }),
                    });
                });

                // Build tabs from common services using unified page builder
                const tabs = buildServiceTabs({
                    snapshotIds,
                    services: commonServices,
                    mode: 'comparison',
                    routePrefix: ROUTES.Compare,
                    timeRanges,
                    overlapMode: isOverlapModeEnabled()
                });

                // Handler: clicking a common phase sets all time ranges to that phase
                const onSelectCommonPhase = (label: string) => {
                    syncTimeRangesToPhase(timeRanges, snapshots, label);
                };

                const onSelectFullRange = () => {
                    syncTimeRangesToFullRange(timeRanges, snapshots);
                };

                // Render header with a top status row (Ready + Overlap toggle) and compare cards below, then set tabs
                comparisonPage.setState({
                    renderTitle: () => React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0' } },
                        React.createElement(CompareTopBar as any, {}),
                        React.createElement(CompareHeader as any, {
                            items: snapshots.map((s, idx) => ({
                                id: s.id,
                                meta: s.snapshot.metadata,
                                title: `Snapshot ${String.fromCharCode(65 + idx)}`,
                                renderPickerScene: () => React.createElement((pickerScenes[idx] as any).Component, { model: pickerScenes[idx] }),
                            })),
                            commonServices,
                            commonPhases,
                            onSelectCommonPhase,
                            onSelectFullRange,
                        })
                    ),
                    // Clear controls to avoid duplicate pickers above tabs
                    controls: [],
                    tabs,
                    subTitle: '',
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
        // Clear cached scenes to free memory upon leaving compare page
        sceneCacheService.clearAll();
    };
});

// Helper function to show status message
function showStatusMessage(message: string, status: 'success' | 'error' | 'info') {
    comparisonPage.setState({
        title: 'Compare Snapshots',
        subTitle: status === 'error' ? 'Error occurred' : status === 'success' ? 'Ready' : 'Loading',
        tabs: undefined,
        controls: undefined,
        renderTitle: undefined,
        getScene: () => new EmbeddedScene({
            body: new SceneFlexLayout({
                direction: 'column',
                children: [
                    new SceneFlexItem({
                        body: new StatusScene({ message, status }) as any,
                    }),
                ],
            }),
        }),
    });
}

// Helper: Show input page for entering snapshot IDs
function showCompareInput(infoMessage?: string) {
    comparisonPage.setState({
        title: 'Compare Snapshots',
        subTitle: '',
        tabs: undefined,
        controls: undefined,
        renderTitle: undefined,
        getScene: () => new EmbeddedScene({
            body: new SceneFlexLayout({
                direction: 'column',
                children: [
                    new SceneFlexItem({
                        body: new InputScene({
                            mode: 'multiple',
                            minInputs: 2,
                            maxInputs: 6,
                            placeholder: 'Snapshot ID',
                            submitLabel: 'Compare',
                            errorMessage: infoMessage
                        }) as any
                    }),
                ],
            }),
        }),
    });
}
