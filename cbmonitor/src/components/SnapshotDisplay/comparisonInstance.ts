import { SceneAppPage, EmbeddedScene, SceneFlexLayout, SceneFlexItem } from '@grafana/scenes';
import { dateTime } from '@grafana/data';
import { ROUTES, prefixRoute, ROUTE_PATHS } from '../../utils/utils.routing';
import { locationService } from '@grafana/runtime';
import React from 'react';
import { layoutService } from '../../services/layoutService';
import { createNoUrlSyncTimeRange, syncTimeRangesToPhase, syncTimeRangesToFullRange, NoUrlSyncTimeRange } from '../../utils/timeRange';
import { loadSnapshots, findCommonServicesInSnapshots, findCommonProductsInSnapshots, findCommonPhasesInSnapshots, formatSnapshotInfo, getMaxSnapshotDuration } from '../../services/snapshotLoader';
import { sceneCacheService } from '../../services/sceneCache';
import { buildServiceTabs } from '../../services/pageBuilder';
import { StatusScene } from '../SceneComponents/StatusScene';
import { InputScene } from '../SceneComponents/InputScene';
import { SettingsDropdown } from '../SettingsDropdown/SettingsDropdown';
import { CompareDashboardHeader } from '../DashboardHeader/CompareDashboardHeader';
import { OverlapToggle } from '../DashboardHeader/actions/OverlapToggle';
import { PinPanelToggle } from '../DashboardHeader/actions/PinPanelToggle';
import { EditModeToggle } from '../DashboardHeader/actions/EditModeToggle';

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
            overlapMode: isOverlapModeEnabled(),
            overlapEndTimeSeconds: ctx.overlapEndTimeSeconds,
            products: ctx.commonProducts,
        });
        comparisonPage.setState({ tabs });
    }
}

function setOverlapMode(value: boolean) {
    overlapMode = value;
    invalidateComparisonTabs();
}

// React component that subscribes to overlap state and renders the unified
// CompareDashboardHeader. The header owns title list, common phase pills, and
// the action row (overlap toggle + future actions + settings dropdown).
interface CompareHeaderContainerProps {
    items: Array<{ id: string; meta: import('types/snapshot').SnapshotMetadata; title?: string }>;
    commonPhases: string[];
    onSelectCommonPhase: (label: string) => void;
    onSelectFullRange: () => void;
}

function CompareHeaderContainer(props: CompareHeaderContainerProps) {
    const [overlap, setOverlap] = React.useState(isOverlapModeEnabled());

    const compareSettingsDropdown = React.useMemo(() => new SettingsDropdown({
        snapshotId: '',
        clusters: [],
        onLayoutChange: () => {
            sceneCacheService.clearAll();
            invalidateComparisonTabs();
        },
        onHideEmptyChange: () => {
            sceneCacheService.clearAll();
            invalidateComparisonTabs();
        },
        showDataSourceSection: false,
        showClusterSection: false,
        showHideEmptySection: true,
    }), []);

    const onToggleOverlap = React.useCallback(() => {
        setOverlap((prev) => {
            const next = !prev;
            setOverlapMode(next);
            return next;
        });
    }, []);

    return React.createElement(CompareDashboardHeader, {
        items: props.items,
        commonPhases: props.commonPhases,
        onSelectCommonPhase: props.onSelectCommonPhase,
        onSelectFullRange: props.onSelectFullRange,
        overlapEnabled: overlap,
        settingsDropdown: compareSettingsDropdown,
        actions: [
            { key: 'overlap', render: () => React.createElement(OverlapToggle, { active: overlap, onToggle: onToggleOverlap }) },
            { key: 'pin', render: () => React.createElement(PinPanelToggle, {}) },
            { key: 'edit', render: () => React.createElement(EditModeToggle, {}) },
        ],
    });
}

// This page is used to compare multiple snapshots
export const comparisonPage = new SceneAppPage({
    title: '',
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
                        // Branded header matching cbmonitor landing page
                        title: 'Compare Snapshots',
                        subtitle: 'Enter 2 to 6 snapshot IDs to compare performance metrics side by side.',
                        iconName: 'columns',
                        iconSize: 'xxxl'
                    }) as any,
                }),
            ],
        }),
    }),
});

// Holds the last computed comparison context (snapshot IDs and common services)
let lastComparisonContext: {
    snapshotIds: string[];
    commonServices: string[];
    commonProducts: string[];
    commonPhases: string[];
    overlapEndTimeSeconds: number;
} | null = null;

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
    const initialParams = locationService.getSearchObject();
    if (initialParams.refresh) {
        locationService.partial({ refresh: null }, true);
    }

    // Force single-panel-per-row layout while on compare page; restore on leave
    const previousLayout = layoutService.getLayout();
    if (previousLayout !== 'rows') {
        layoutService.setLayout('rows');
    }
    // Track currently loaded snapshot IDs to avoid reloading
    let currentLoadedSnapshotIds: string[] = [];
    let currentSnapshotSignature = '';

    const getSnapshotIdsFromParams = (): string[] => {
        const params = locationService.getSearchObject();

        let snapshotIds: string[] = [];
        if (Array.isArray(params.snapshot)) {
            snapshotIds = params.snapshot as string[];
        } else if (typeof params.snapshot === 'string') {
            snapshotIds = [params.snapshot];
        }

        return snapshotIds.filter(id => id && id.trim().length > 0);
    };

    // Function to load snapshots for comparison based on current URL
    const loadSnapshotsFromUrl = () => {
        const snapshotIds = getSnapshotIdsFromParams();

        // When snapshot count is invalid, show input page instead of error
        if (snapshotIds.length < 2 || snapshotIds.length > 6) {
            showCompareInput();
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
                currentSnapshotSignature = snapshotIds.join('|');

                // Invalidate cached scenes when snapshot set changes
                sceneCacheService.clearAll();
                
                // Fetch all snapshots using unified loader
                const snapshots = await loadSnapshots(snapshotIds);

                // Find common services, products, and phases using utility functions
                const commonServices = findCommonServicesInSnapshots(snapshots);
                const commonProducts = findCommonProductsInSnapshots(snapshots);
                const commonPhases = findCommonPhasesInSnapshots(snapshots);
                const overlapEndTimeSeconds = Math.max(1, Math.floor(getMaxSnapshotDuration(snapshots.map((s) => s.metadata)) / 1000));

                // Build success message with snapshot info
                const snapshotInfo = formatSnapshotInfo(snapshots);

                // Persist comparison context for later use when building dashboards
                lastComparisonContext = {
                    snapshotIds: [...snapshotIds],
                    commonServices,
                    commonProducts,
                    commonPhases,
                    overlapEndTimeSeconds,
                };

                const successMessage = `Successfully loaded ${snapshots.length} snapshots:\n\n${snapshotInfo}\n\nCommon phases (${commonPhases.length}): ${commonPhases.join(', ') || 'none'}\n\n✓ All snapshots validated and ready for comparison!`;

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

                // Build tabs from common services using unified page builder
                const tabs = buildServiceTabs({
                    snapshotIds,
                    services: commonServices,
                    mode: 'comparison',
                    routePrefix: ROUTES.Compare,
                    timeRanges,
                    overlapMode: isOverlapModeEnabled(),
                    overlapEndTimeSeconds,
                    products: commonProducts,
                });

                // Handler: clicking a common phase sets all time ranges to that phase
                const onSelectCommonPhase = (label: string) => {
                    syncTimeRangesToPhase(timeRanges, snapshots, label);
                };

                const onSelectFullRange = () => {
                    syncTimeRangesToFullRange(timeRanges, snapshots);
                };

                // Render the unified compare header (title list + common phase pills + actions)
                const headerItems = snapshots.map((s, idx) => ({
                    id: s.id,
                    meta: s.snapshot.metadata,
                    title: `Snapshot ${String.fromCharCode(65 + idx)}`,
                }));
                comparisonPage.setState({
                    renderTitle: () => React.createElement(CompareHeaderContainer, {
                        items: headerItems,
                        commonPhases,
                        onSelectCommonPhase,
                        onSelectFullRange,
                    }),
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

    // Subscribe to URL changes to reload only when snapshot IDs change (ignore refresh/phase churn)
    const urlSubscription = locationService.getHistory().listen(() => {
        const nextSnapshotIds = getSnapshotIdsFromParams();
        const nextSignature = nextSnapshotIds.join('|');
        if (nextSignature !== currentSnapshotSignature) {
            loadSnapshotsFromUrl();
        }
    });

    // Return deactivation handler
    return () => {
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
        title: '',
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
        title: '',
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
                            errorMessage: infoMessage,
                            // Branded header matching cbmonitor landing page
                            title: 'Compare Snapshots',
                            subtitle: 'Enter 2 to 6 snapshot IDs to compare performance metrics side by side.',
                            iconName: 'columns',
                            iconSize: 'xxxl'
                        }) as any
                    }),
                ],
            }),
        }),
    });
}
