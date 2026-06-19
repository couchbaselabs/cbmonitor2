import { SceneQueryRunner } from '@grafana/scenes';
import { clusterFilterService } from './clusterFilterService';
import { instanceFilterService } from './instanceFilterService';
import { PROM_DATASOURCE_REF } from '../constants';
import { injectClusterFilter, injectInstanceFilter } from '../utils/utils.panel';

export function getInstancesFromMetricRunner(snapshotId: string, metricName = 'sys_cpu_utilization_rate'): SceneQueryRunner {
  const clusterFilter = clusterFilterService.getCurrentCluster();
  const instanceFilter = instanceFilterService.getCurrentInstance();

  // Discover instances via PromQL, applying active filters so the query only
  // returns nodes inside the active scope.
  let expr = `group by (instance) (${metricName}{job="${snapshotId}"})`;
  if (clusterFilter) {
    expr = injectClusterFilter(expr, clusterFilter);
  }
  if (instanceFilter) {
    expr = injectInstanceFilter(expr, instanceFilter);
  }
  return new SceneQueryRunner({
    datasource: PROM_DATASOURCE_REF,
    queries: [{
      refId: 'instances',
      expr,
      legendFormat: '{{instance}}',
      instant: true,
    }],
  });
}

/**
 * Parse the set of `instance` label values from a Prometheus data-frame
 * response (instance is carried as a field label).
 */
export function parseInstancesFromFrames(frames: any[]): string[] {
  if (!Array.isArray(frames) || frames.length === 0) {return [];}
  const set = new Set<string>();
  for (const frame of frames) {
    const fields = frame?.fields ?? [];
    for (const f of fields) {
      const instance = f?.labels?.instance;
      if (instance) {
        set.add(String(instance));
      }
    }
  }
  return Array.from(set);
}

export function getInstancesFromOverlapMetricRunner(snapshotIds: string, metricName = 'sys_cpu_utilization_rate'): SceneQueryRunner {
  // Overlap discovers instances across every compared snapshot at once via a
  // regex job matcher (`job=~"a|b"`). The gateway recognises the multi-snapshot
  // matcher and routes it through the overlap seam; the single Prometheus
  // datasource is the only query target.
  const expr = `group by (instance) (${metricName}{job=~"${snapshotIds}"})`;

  return new SceneQueryRunner({
    datasource: PROM_DATASOURCE_REF,
    queries: [{
      refId: 'instances',
      expr,
      legendFormat: '{{instance}}',
      instant: true,
    }],
  });
}
