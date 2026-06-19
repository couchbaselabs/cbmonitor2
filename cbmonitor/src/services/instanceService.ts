import { SceneQueryRunner } from '@grafana/scenes';
import { clusterFilterService } from './clusterFilterService';
import { instanceFilterService } from './instanceFilterService';
import { PROXY_PROM_DATASOURCE_REF, PROM_DATASOURCE_REF } from '../constants';
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
 * Convenience util to parse instances from a data frame response.
 * Supports Prometheus responses where instance is a field label,
 * and SQL++ responses where instance is a column.
 */
export function parseInstancesFromFrames(frames: any[]): string[] {
  if (!Array.isArray(frames) || frames.length === 0) return [];
  const set = new Set<string>();
  for (const frame of frames) {
    const fields = frame?.fields ?? [];
    for (const f of fields) {
      // Extract from Prometheus field labels
      const instance = f?.labels?.instance;
      if (instance) {
        set.add(String(instance));
      }
    }
    // Fallback: try SQL++ style (named instance column)
    const instanceField = fields.find((f: any) => f?.name === 'instance')
      ?? fields.find((f: any) => (f?.type?.name === 'string') || f?.type === 'string');
    if (instanceField) {
      const rawValues = instanceField?.values ?? [];
      const arr = (rawValues && typeof rawValues.toArray === 'function') ? rawValues.toArray() : Array.from(rawValues);
      for (const v of arr) {
        if (v) set.add(String(v));
      }
    }
  }
  return Array.from(set);
}

export function getInstancesFromProxyPromMetricRunner(snapshotId: string, metricName = 'sys_cpu_utilization_rate'): SceneQueryRunner {
  // This is a bit of a hack to get instance lists from Proxy Prometheus without needing to define a new query language or builder.
  // We leverage the fact that Proxy Prom supports PromQL syntax and just use a special datasource reference to route it correctly.
  const expr = `group by (instance) (${metricName}{job=~"${snapshotId}"})`;

  return new SceneQueryRunner({
    datasource: PROXY_PROM_DATASOURCE_REF,
    queries: [{
      refId: 'instances',
      expr,
      legendFormat: '{{instance}}',
      instant: true,
    }],
  });
}
