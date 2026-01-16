import { EmbeddedScene, SceneFlexLayout, SceneFlexItem } from '@grafana/scenes';
import { getInstancesFromMetricRunner, parseInstancesFromFrames } from 'services/instanceService';
import { layoutService } from '../services/layoutService';

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
    minHeight: 50,
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

  return new EmbeddedScene({ body: layout });
}
