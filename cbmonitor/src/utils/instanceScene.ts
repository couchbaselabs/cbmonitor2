import { EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneDataLayerSet } from '@grafana/scenes';
import { getInstancesFromMetricRunner, getInstancesFromProxyPromMetricRunner, parseInstancesFromFrames } from 'services/instanceService';
import { layoutService } from '../services/layoutService';
import { SnapshotPhaseRegionsLayer } from '../layers/SnapshotPhaseRegionsLayer';
import { createOverlapMetricPanel } from './utils.panelOverlap';
import { createMetricPanel } from './utils.panel';
import type { BuilderBranch, MetricContext, ServiceBuilder } from '../dashboards/types';

type OverlapMetricPanelFactoryOptions = Omit<Parameters<typeof createOverlapMetricPanel>[2], 'overlapEndTimeSeconds'>;

export type OverlapPanelBuildContext = {
  instance?: string;
  titleSuffix: string;
  instanceFilter: string;
  instanceSumBySuffix: string;
  overlapEndTimeSeconds?: number;
  createOverlapMetricPanel: (
    metricName: string,
    title: string,
    options: OverlapMetricPanelFactoryOptions
  ) => SceneFlexItem;
};

export type InstanceAwareOverlapSceneOptions = {
  instanceMetric?: string;
  overlapEndTimeSeconds?: number;
};

function createOverlapPanelBuildContext(instance?: string, overlapEndTimeSeconds?: number): OverlapPanelBuildContext {
  return {
    instance,
    titleSuffix: instance ? ` - ${instance}` : '',
    instanceFilter: instance ? `, instance="${instance}"` : '',
    instanceSumBySuffix: instance ? '' : ', instance',
    overlapEndTimeSeconds,
    createOverlapMetricPanel: (metricName, title, options) => createOverlapMetricPanel(metricName, title, {
      ...options,
      overlapEndTimeSeconds,
    }),
  };
}

/**
 * Build an EmbeddedScene with base panels and dynamic per-instance panels.
 * - Reads optional ?layout=rows|grid from URL and syncs to layoutService
 * - Rebuilds panels when instances or layout mode change
 * - Sets flex direction to column when in rows mode
 */
export function createInstanceAwareScene(
  snapshotId: string,
  instanceMetric: string,
  buildBaseChildren: () => SceneFlexItem[],
  buildPerInstancePanels: (instance: string) => SceneFlexItem[],
  buildFallbackPanels: () => SceneFlexItem[]
): EmbeddedScene {
  // Sync URL layout param to layoutService (if present)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('layout');
    if (p === 'rows' || p === 'grid') {
      layoutService.setLayout(p as 'rows' | 'grid');
    }
  }

  const layout = new SceneFlexLayout({
    minHeight: 55,
    direction: layoutService.getLayout() === 'rows' ? 'column' : 'row',
    wrap: 'wrap',
    children: buildBaseChildren(),
  });

  const instancesRunner = getInstancesFromMetricRunner(snapshotId, instanceMetric);
  layout.setState({ $data: instancesRunner });
  (instancesRunner as any).run?.();

  let currentInstances: string[] = [];

  const rebuild = () => {
    const base = buildBaseChildren();
    let perInstancePanels: SceneFlexItem[] = [];
    if (currentInstances && currentInstances.length > 0) {
      for (const i of currentInstances) {
        perInstancePanels.push(...buildPerInstancePanels(i));
      }
    } else {
      perInstancePanels = buildFallbackPanels();
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

  // Attach global snapshot phase regions as a data layer so all panels inherit annotations
  const globalLayers = new SceneDataLayerSet({
    layers: [new SnapshotPhaseRegionsLayer({ isEnabled: true, snapshotId, name: 'Snapshot Phases' })],
  });

  return new EmbeddedScene({ body: layout, $data: globalLayers });
}

// -----------------------------------------------------------------------------
// Unified `ServiceBuilder` bridges
// -----------------------------------------------------------------------------
// These adapters let a single per-service `ServiceBuilder` drive both
// single-snapshot and overlap dashboards. They wrap the existing scene
// drivers and synthesize the appropriate `MetricContext` for each pass.
// The per-mode factories (`createMetricPanel` / `createOverlapMetricPanel`)
// and the underlying drivers stay unchanged.

function makeSingleContext(snapshotId: string, branch: BuilderBranch, instance?: string): MetricContext {
  return {
    mode: 'single',
    branch,
    jobSelector: `job="${snapshotId}"`,
    // Single base panels don't inject an instance selector; per-instance
    // panels inline `instance="<i>"` directly in their PromQL.
    instanceFilter: '',
    titleSuffix: '',
    perInstance: instance,
    sumBy: (...extras) => ['instance', ...extras].join(', '),
    // Single legend separator is " , " (matches makeLegendTemplate in utils.panel.ts).
    legend: (...labels) => ['{{instance}}', ...labels.map((l) => `{{${l}}}`)].join(' , '),
    panel: (metricName, title, spec) => createMetricPanel(metricName, title, {
      ...spec,
      snapshotId,
    }),
    modeOnly: (modes, items) => (modes.includes('single') ? items : []),
  };
}

function makeOverlapContext(
  snapshotIds: string,
  overlapCtx: OverlapPanelBuildContext,
): MetricContext {
  const instance = overlapCtx.instance;
  return {
    mode: 'overlap',
    // Overlap reuses the 'base' branch for both with-instance and
    // without-instance passes; instance shape varies via instanceFilter/sumBy.
    branch: 'base',
    jobSelector: `job=~"${snapshotIds}"`,
    instanceFilter: overlapCtx.instanceFilter,
    titleSuffix: overlapCtx.titleSuffix,
    perInstance: instance,
    sumBy: (...extras) => {
      const dims = ['job'];
      if (!instance) {
        dims.push('instance');
      }
      return [...dims, ...extras].join(', ');
    },
    // Overlap legend separator is ", " (matches the literal strings used
    // throughout dashboards/overlap/*).
    legend: (...labels) => ['{{job}}', '{{instance}}', ...labels.map((l) => `{{${l}}}`)].join(', '),
    panel: (metricName, title, spec) => overlapCtx.createOverlapMetricPanel(metricName, title, {
      expr: spec.expr,
      legendFormat: spec.legendFormat,
      unit: spec.unit,
      width: spec.width,
      height: spec.height,
    }),
    modeOnly: (modes, items) => (modes.includes('overlap') ? items : []),
  };
}

/**
 * Single-snapshot scene driver for unified `ServiceBuilder`s. Calls the
 * builder three ways (base, perInstance for each discovered instance,
 * or fallback if no instances) and wires the existing
 * `createInstanceAwareScene` for layout / phase-regions / subscriptions.
 */
export function createInstanceAwareSceneFromBuilder(
  snapshotId: string,
  builder: ServiceBuilder,
  options: { instanceMetric: string }
): EmbeddedScene {
  return createInstanceAwareScene(
    snapshotId,
    options.instanceMetric,
    () => builder(makeSingleContext(snapshotId, 'base')),
    (i: string) => builder(makeSingleContext(snapshotId, 'perInstance', i)),
    () => builder(makeSingleContext(snapshotId, 'fallback')),
  );
}

/**
 * Overlap scene driver for unified `ServiceBuilder`s. Bridges to the
 * existing `createInstanceAwareOverlapScene` by wrapping its
 * `OverlapPanelBuildContext` in a `MetricContext` before invoking the
 * builder.
 */
export function createInstanceAwareOverlapSceneFromBuilder(
  snapshotIds: string,
  builder: ServiceBuilder,
  options: InstanceAwareOverlapSceneOptions = {}
): EmbeddedScene {
  return createInstanceAwareOverlapScene(
    snapshotIds,
    (overlapCtx) => builder(makeOverlapContext(snapshotIds, overlapCtx)),
    options,
  );
}

export function createInstanceAwareOverlapScene(
  snapshotIds: string,
  buildPanels: (context: OverlapPanelBuildContext) => SceneFlexItem[],
  options: InstanceAwareOverlapSceneOptions = {}
): EmbeddedScene {
  const instanceMetric = options.instanceMetric ?? 'sys_cpu_utilization_rate';
  const resolvedOverlapEndTimeSeconds = options.overlapEndTimeSeconds;

  const initialLayout = layoutService.getLayout();
  const layout = new SceneFlexLayout({
    minHeight: 55,
    direction: initialLayout === 'rows' ? 'column' : 'row',
    wrap: 'wrap',
    children: [],
  });

  const instancesRunner = getInstancesFromProxyPromMetricRunner(snapshotIds, instanceMetric);
  layout.setState({ $data: instancesRunner });
  (instancesRunner as any).run?.();

  let currentInstances: string[] = [];

  const rebuild = () => {
    let perInstancePanels: SceneFlexItem[] = [];
    if (currentInstances && currentInstances.length > 0) {
      for (const i of currentInstances) {
        perInstancePanels.push(...buildPanels(createOverlapPanelBuildContext(i, resolvedOverlapEndTimeSeconds)));
      }
    } else {
      perInstancePanels = buildPanels(createOverlapPanelBuildContext(undefined, resolvedOverlapEndTimeSeconds));
    }
    layout.setState({ children: [...perInstancePanels] });
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
