import { EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneDataLayerSet } from '@grafana/scenes';
import { getInstancesFromMetricRunner, getInstancesFromOverlapMetricRunner, parseInstancesFromFrames } from 'services/instanceService';
import { layoutService } from '../services/layoutService';
import { SnapshotPhaseRegionsLayer } from '../layers/SnapshotPhaseRegionsLayer';
import { createOverlapMetricPanel } from './utils.panelOverlap';
import { createMetricPanel } from './utils.panel';
import type { BuilderBranch, MetricContext, ServiceBuilder } from '../dashboards/types';

export interface InstanceAwareSceneOptions {
    instanceMetric: string;
}

export interface InstanceAwareOverlapSceneOptions {
    instanceMetric: string;
    overlapEndTimeSeconds?: number;
}

/**
 * Single-mode `MetricContext`. The single panel factory injects
 * `instance="<i>"` selectors directly in per-instance / fallback PromQL,
 * so `instanceFilter` is always empty here; per-instance variants pull
 * the instance value from `perInstance`.
 */
function makeSingleContext(snapshotId: string, branch: BuilderBranch, instance?: string): MetricContext {
    return {
        mode: 'single',
        branch,
        jobSelector: `job="${snapshotId}"`,
        instanceFilter: '',
        titleSuffix: '',
        perInstance: instance,
        sumBy: (...extras) => ['instance', ...extras].join(', '),
        // Matches makeLegendTemplate() in utils.panel.ts — " , " separator.
        legend: (...labels) => ['{{instance}}', ...labels.map((l) => `{{${l}}}`)].join(' , '),
        panel: (metricName, title, spec) => createMetricPanel(metricName, title, {
            ...spec,
            snapshotId,
        }),
        modeOnly: (modes, items) => (modes.includes('single') ? items : []),
    };
}

/**
 * Overlap-mode `MetricContext`. Used for both with-instance and
 * without-instance passes — shape variations are expressed via
 * `instanceFilter` / `sumBy()`. Always uses `branch: 'base'` since
 * overlap doesn't have separate perInstance / fallback branches.
 */
function makeOverlapContext(
    snapshotIds: string,
    instance: string | undefined,
    overlapEndTimeSeconds: number | undefined,
): MetricContext {
    return {
        mode: 'overlap',
        branch: 'base',
        jobSelector: `job=~"${snapshotIds}"`,
        instanceFilter: instance ? `, instance="${instance}"` : '',
        titleSuffix: instance ? ` - ${instance}` : '',
        perInstance: instance,
        sumBy: (...extras) => {
            const dims = ['job'];
            if (!instance) {
                dims.push('instance');
            }
            return [...dims, ...extras].join(', ');
        },
        legend: (...labels) => ['{{job}}', '{{instance}}', ...labels.map((l) => `{{${l}}}`)].join(', '),
        panel: (metricName, title, spec) => createOverlapMetricPanel(metricName, title, {
            expr: spec.expr,
            legendFormat: spec.legendFormat,
            unit: spec.unit,
            width: spec.width,
            height: spec.height,
            overlapEndTimeSeconds,
        }),
        modeOnly: (modes, items) => (modes.includes('overlap') ? items : []),
    };
}

/**
 * Single-snapshot scene driver. Calls `builder` once with `branch: 'base'`
 * for the always-emitted aggregated panels, then either once per
 * discovered instance with `branch: 'perInstance'`, or once with
 * `branch: 'fallback'` when no instances are reported. Wires layout-mode
 * reactivity and a `SnapshotPhaseRegionsLayer` data layer so all panels
 * inherit phase annotations.
 */
export function createInstanceAwareScene(
    snapshotId: string,
    builder: ServiceBuilder,
    options: InstanceAwareSceneOptions,
): EmbeddedScene {
    // Sync URL ?layout=rows|grid to layoutService at mount time.
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const p = params.get('layout');
        if (p === 'rows' || p === 'grid') {
            layoutService.setLayout(p);
        }
    }

    const layout = new SceneFlexLayout({
        minHeight: 55,
        direction: layoutService.getLayout() === 'rows' ? 'column' : 'row',
        wrap: 'wrap',
        children: builder(makeSingleContext(snapshotId, 'base')),
    });

    const instancesRunner = getInstancesFromMetricRunner(snapshotId, options.instanceMetric);
    layout.setState({ $data: instancesRunner });
    (instancesRunner as any).run?.();

    let currentInstances: string[] = [];

    const rebuild = () => {
        const base = builder(makeSingleContext(snapshotId, 'base'));
        let perInstancePanels: SceneFlexItem[] = [];
        if (currentInstances.length > 0) {
            for (const i of currentInstances) {
                perInstancePanels.push(...builder(makeSingleContext(snapshotId, 'perInstance', i)));
            }
        } else {
            perInstancePanels = builder(makeSingleContext(snapshotId, 'fallback'));
        }
        layout.setState({ children: [...base, ...perInstancePanels] });
    };

    instancesRunner.subscribeToState((state: any) => {
        const frames = state?.data?.series ?? [];
        currentInstances = parseInstancesFromFrames(frames);
        rebuild();
    });

    layoutService.subscribe((mode) => {
        layout.setState({ direction: mode === 'rows' ? 'column' : 'row' });
        rebuild();
    });

    rebuild();

    const globalLayers = new SceneDataLayerSet({
        layers: [new SnapshotPhaseRegionsLayer({ isEnabled: true, snapshotId, name: 'Snapshot Phases' })],
    });

    return new EmbeddedScene({ body: layout, $data: globalLayers });
}

/**
 * Overlap (multi-snapshot) scene driver. Calls `builder` once per
 * discovered instance group (with `instance` set so the context filters
 * to that instance), or once with `instance` unset when no instances are
 * reported. Always uses `branch: 'base'` — overlap doesn't distinguish
 * perInstance / fallback the way single does.
 */
export function createInstanceAwareOverlapScene(
    snapshotIds: string,
    builder: ServiceBuilder,
    options: InstanceAwareOverlapSceneOptions,
): EmbeddedScene {
    const layout = new SceneFlexLayout({
        minHeight: 55,
        direction: layoutService.getLayout() === 'rows' ? 'column' : 'row',
        wrap: 'wrap',
        children: [],
    });

    const instancesRunner = getInstancesFromOverlapMetricRunner(snapshotIds, options.instanceMetric);
    layout.setState({ $data: instancesRunner });
    (instancesRunner as any).run?.();

    let currentInstances: string[] = [];

    const rebuild = () => {
        let perInstancePanels: SceneFlexItem[] = [];
        if (currentInstances.length > 0) {
            for (const i of currentInstances) {
                perInstancePanels.push(...builder(makeOverlapContext(snapshotIds, i, options.overlapEndTimeSeconds)));
            }
        } else {
            perInstancePanels = builder(makeOverlapContext(snapshotIds, undefined, options.overlapEndTimeSeconds));
        }
        layout.setState({ children: perInstancePanels });
    };

    instancesRunner.subscribeToState((state: any) => {
        const frames = state?.data?.series ?? [];
        currentInstances = parseInstancesFromFrames(frames);
        rebuild();
    });

    layoutService.subscribe((mode) => {
        layout.setState({ direction: mode === 'rows' ? 'column' : 'row' });
        rebuild();
    });

    rebuild();

    return new EmbeddedScene({ body: layout });
}
