import { SceneAppPage, EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneObjectBase, SceneObjectState, SceneComponentProps, SceneTimeRange, SceneTimePicker } from '@grafana/scenes';
import { dateTime, TimeOption } from '@grafana/data';
import { ROUTES, prefixRoute, ROUTE_PATHS } from '../../utils/utils.routing';
import { snapshotService } from '../../services/snapshotService';
import { locationService } from '@grafana/runtime';
import React from 'react';
import { Alert, Button, Input, useStyles2, Icon } from '@grafana/ui';
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

// Cache for metric scenes to avoid re-creating panels when switching tabs
const metricsSceneCache = new Map<string, EmbeddedScene>();
function makeCacheKey(serviceKey: string, snapshotId: string) {
    return `${serviceKey}:${snapshotId}`;
}
function clearMetricsSceneCache() {
    metricsSceneCache.clear();
}

// Global overlap mode (when true, hide columns and show placeholders)
let overlapMode = false;
function isOverlapModeEnabled() {
    return overlapMode;
}
function invalidateComparisonTabs() {
    const ctx = getComparisonContext();
    if (ctx && ctx.commonServices) {
        const tabs = buildComparisonServiceTabs(ctx.commonServices);
        comparisonPage.setState({ tabs });
    }
}
function setOverlapMode(value: boolean) {
    overlapMode = value;
    invalidateComparisonTabs();
}

// Local header row showing Ready + Overlap button (non-functional)
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

// Simple placeholder scene used in overlap mode
interface PlaceholderSceneState extends SceneObjectState {
    text: string;
}
class PlaceholderScene extends SceneObjectBase<PlaceholderSceneState> {
    public static Component = PlaceholderRenderer;
    public constructor(text: string = 'tbc') {
        super({ text });
    }
}
function PlaceholderRenderer({ model }: SceneComponentProps<PlaceholderScene>) {
    const { text } = model.useState();
    return React.createElement('div', {
        style: {
            height: '100vh',
            minHeight: '600px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9CA3AF',
            fontSize: 14,
        }
    }, text);
}

// Input scene state
interface CompareInputSceneState extends SceneObjectState {
    errorMessage?: string;
}

// Scene to render inputs for snapshot IDs
class CompareInputScene extends SceneObjectBase<CompareInputSceneState> {
    public static Component = CompareInputRenderer;
    public constructor(state?: Partial<CompareInputSceneState>) {
        super({ errorMessage: state?.errorMessage });
    }
}

// Renderer for CompareInputScene (no JSX)
function CompareInputRenderer({ model }: SceneComponentProps<CompareInputScene>) {
    const { errorMessage } = model.useState();
    const s = useStyles2(() => ({
        container: {
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 16,
        } as React.CSSProperties,
        header: { display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
        subtitle: { color: '#9CA3AF', fontSize: 14 } as React.CSSProperties,
        form: { display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch', width: '100%', maxWidth: 720 } as React.CSSProperties,
        inputsList: { display: 'flex', flexDirection: 'column', gap: 8 } as React.CSSProperties,
        row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } as React.CSSProperties,
        input: { flex: 1, minWidth: 280 } as React.CSSProperties,
        actions: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-start' } as React.CSSProperties,
        info: { fontSize: 12, color: '#9CA3AF' } as React.CSSProperties,
    }));

    // Maintain a dynamic list of input boxes; start with two
    const [ids, setIds] = React.useState<string[]>(['', '']);
    const [localError, setLocalError] = React.useState<string | undefined>(undefined);

    const onSubmit = () => {
        const parts = ids.map((p) => p.trim()).filter((p) => p.length > 0);
        if (parts.length < 2 || parts.length > 6) {
            setLocalError('Please enter between 2 and 6 snapshot IDs, comma-separated.');
            return;
        }
        locationService.push(prefixRoute(ROUTE_PATHS.compareSnapshots(parts)));
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { onSubmit(); }
    };

    const updateId = (idx: number, value: string) => {
        setIds((prev) => prev.map((v, i) => (i === idx ? value : v)));
    };

    const addInput = () => {
        setLocalError(undefined);
        setIds((prev) => (prev.length >= 6 ? prev : [...prev, '']));
    };

    const removeInput = (idx: number) => {
        setLocalError(undefined);
        setIds((prev) => {
            if (prev.length <= 2) return prev; // keep minimum two inputs
            return prev.filter((_, i) => i !== idx);
        });
    };

    return React.createElement('div', { style: s.container },
        React.createElement('div', { style: s.header },
            React.createElement(Icon as any, { name: 'swap-horiz', size: 'xl' }),
        ),
        errorMessage && React.createElement(Alert as any, { severity: 'info', title: 'Info' }, errorMessage),
        localError && React.createElement(Alert as any, { severity: 'error', title: 'Validation' }, localError),
        React.createElement('div', { style: s.form },
            React.createElement('div', { style: s.inputsList },
                ...ids.map((val, idx) => React.createElement('div', { key: idx, style: s.row },
                    React.createElement(Input as any, {
                        value: val,
                        placeholder: `Snapshot ID #${idx + 1}`,
                        onChange: (e: any) => updateId(idx, e.currentTarget.value),
                        onKeyDown,
                        style: s.input,
                        prefix: React.createElement(Icon as any, { name: 'search' }),
                        autoFocus: idx === 0,
                    }),
                    idx >= 2 && React.createElement(Button as any, { onClick: () => removeInput(idx), size: 'sm' }, '-')
                ))
            ),
            React.createElement('div', { style: s.actions },
                React.createElement(Button as any, { onClick: addInput, size: 'sm', disabled: ids.length >= 6 }, '+'),
                React.createElement(Button as any, { onClick: onSubmit, size: 'md' }, 'Compare'),
                React.createElement(Button as any, { onClick: () => locationService.push(prefixRoute(ROUTE_PATHS.search())), size: 'md' }, 'Back to Search')
            )
        ),
        React.createElement('div', { style: s.info }, 'Tip: at least two IDs; max six.')
    );
}

// This page is used to compare multiple snapshots (as a tab; routePath relative so nested Route matches)
export const comparisonPage = new SceneAppPage({
    title: 'Compare Snapshots',
    url: prefixRoute(ROUTE_PATHS.compare()),
    routePath: `${ROUTES.Compare}/*`,
    getScene: () => new EmbeddedScene({
        body: new SceneFlexLayout({
            direction: 'column',
            children: [
                new SceneFlexItem({
                    body: new CompareInputScene({ errorMessage: 'Provide 2 to 6 snapshot IDs to compare.' }) as any,
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
                clearMetricsSceneCache();

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

                // Compute common phase labels (case-insensitive, trimmed), preserving first snapshot's order
                const phaseLabelSets = snapshots.map((s) => {
                    const phases = Array.isArray(s.snapshot.metadata.phases) ? s.snapshot.metadata.phases : [];
                    return new Set(
                        phases
                            .map((p: any) => (typeof p?.label === 'string' ? p.label.trim().toLowerCase() : ''))
                            .filter((lbl: string) => lbl.length > 0)
                    );
                });

                const commonPhaseNorms = phaseLabelSets.length > 0
                    ? [...phaseLabelSets[0]].filter((lbl) => phaseLabelSets.every((set) => set.has(lbl)))
                    : [];

                const firstLabelsOrdered: string[] = (Array.isArray(snapshots[0].snapshot.metadata.phases)
                    ? snapshots[0].snapshot.metadata.phases
                    : [])
                    .map((p: any) => (typeof p?.label === 'string' ? p.label : ''))
                    .filter((lbl: string) => lbl.length > 0);

                const commonPhases = firstLabelsOrdered
                    .filter((lbl) => commonPhaseNorms.includes(lbl.trim().toLowerCase()))
                    .filter((v, i, arr) => arr.indexOf(v) === i);

                // Build success message with snapshot info
                const snapshotInfo = snapshots.map((s, idx) => {
                    const meta = s.snapshot.metadata;
                    return `${idx + 1}. Snapshot ID: ${s.id}\n   Services: ${meta.services.join(', ')}\n   Time Range: ${meta.ts_start} to ${meta.ts_end}`;
                }).join('\n\n');

                // Persist comparison context for later use when building dashboards
                lastComparisonContext = { snapshotIds: [...snapshotIds], commonServices, commonPhases };

                const successMessage = `Successfully loaded ${snapshots.length} snapshots:\n\n${snapshotInfo}\n\nCommon services (${commonServices.length}): ${commonServices.join(', ') || 'none'}\nCommon phases (${commonPhases.length}): ${commonPhases.join(', ') || 'none'}\n\n✓ All snapshots validated and ready for comparison!`;

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

                // Handler: clicking a common phase sets all time ranges to that phase
                const onSelectCommonPhase = (label: string) => {
                    const target = label.trim().toLowerCase();
                    timeRanges.forEach((tr, idx) => {
                        const meta = snapshots[idx].snapshot.metadata;
                        const phases = Array.isArray(meta.phases) ? meta.phases : [];
                        const match = phases.find((p: any) => typeof p?.label === 'string' && p.label.trim().toLowerCase() === target);
                        if (match && match.ts_start && match.ts_end) {
                            tr.onTimeRangeChange({
                                from: dateTime(match.ts_start),
                                to: dateTime(match.ts_end),
                                raw: { from: match.ts_start, to: match.ts_end }
                            });
                        }
                    });
                };

                const onSelectFullRange = () => {
                    timeRanges.forEach((tr, idx) => {
                        const meta = snapshots[idx].snapshot.metadata;
                        if (meta.ts_start && meta.ts_end) {
                            tr.onTimeRangeChange({
                                from: dateTime(meta.ts_start),
                                to: dateTime(meta.ts_end),
                                raw: { from: meta.ts_start, to: meta.ts_end }
                            });
                        }
                    });
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
        clearMetricsSceneCache();
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

        const urlPath = svc.segment ? `${ROUTES.Compare}/${svc.segment}` : ROUTE_PATHS.compare();
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
                // If overlap mode is enabled, render a single placeholder instead of metric panels
                if (isOverlapModeEnabled()) {
                    const children = [new SceneFlexItem({ body: new PlaceholderScene('tbc') as any })];
                    return new EmbeddedScene({
                        body: new SceneFlexLayout({ direction: 'row', children }),
                    });
                }

                // Reuse cached scenes per (service,snapshot) to avoid reloading on tab switch
                const children = ctx.snapshotIds.map((sid, idx) => {
                    const key = makeCacheKey(svc.key, sid);
                    let scene = metricsSceneCache.get(key);
                    if (!scene) {
                        scene = builder(sid);
                        metricsSceneCache.set(key, scene);
                    }
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
                        body: new ComparisonStatusScene(message, status) as any,
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
                    new SceneFlexItem({ body: new CompareInputScene({ errorMessage: infoMessage }) as any }),
                ],
            }),
        }),
    });
}
