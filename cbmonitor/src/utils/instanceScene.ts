import { EmbeddedScene, SceneFlexLayout, SceneFlexItem, SceneDataLayerSet } from '@grafana/scenes';
import { getInstancesFromMetricRunner, getInstancesFromEvilPromMetricRunner, parseInstancesFromFrames } from 'services/instanceService';
import { layoutService } from '../services/layoutService';
import { SnapshotPhaseRegionsLayer } from '../layers/SnapshotPhaseRegionsLayer';
import { setDefaultOverlapEndTimeSeconds } from './utils.panelOverlap';

export type OverlapPanelBuildContext = {
  instance?: string;
  titleSuffix: string;
  instanceFilter: string;
  instanceSumBySuffix: string;
};

function createOverlapPanelBuildContext(instance?: string): OverlapPanelBuildContext {
  return {
    instance,
    titleSuffix: instance ? ` - ${instance}` : '',
    instanceFilter: instance ? `, instance="${instance}"` : '',
    instanceSumBySuffix: instance ? '' : ', instance',
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

export function createInstanceAwareOverlapScene(
  snapshotIds: string,
  buildPanels: (context: OverlapPanelBuildContext) => SceneFlexItem[],
  instanceMetricOrOverlapEndTimeSeconds?: string | number,
  overlapEndTimeSeconds?: number
): EmbeddedScene {
  const instanceMetric = typeof instanceMetricOrOverlapEndTimeSeconds === 'string'
    ? instanceMetricOrOverlapEndTimeSeconds
    : 'sys_cpu_utilization_rate';

  const resolvedOverlapEndTimeSeconds = typeof instanceMetricOrOverlapEndTimeSeconds === 'number'
    ? instanceMetricOrOverlapEndTimeSeconds
    : overlapEndTimeSeconds;

  setDefaultOverlapEndTimeSeconds(resolvedOverlapEndTimeSeconds);

  const layout = new SceneFlexLayout({
    minHeight: 55,
    direction: 'row',
    wrap: 'wrap',
    children: [],
  });

  const instancesRunner = getInstancesFromEvilPromMetricRunner(snapshotIds, instanceMetric);
  layout.setState({ $data: instancesRunner });
  (instancesRunner as any).run?.();

  let currentInstances: string[] = [];

  const rebuild = () => {
    let perInstancePanels: SceneFlexItem[] = [];
    if (currentInstances && currentInstances.length > 0) {
      for (const i of currentInstances) {
        perInstancePanels.push(...buildPanels(createOverlapPanelBuildContext(i)));
      }
    } else {
      perInstancePanels = buildPanels(createOverlapPanelBuildContext());
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
