import { SceneQueryRunner } from '@grafana/scenes';
import { CBQueryBuilder } from '../utils/utils.cbquery';
import { dataSourceService } from './datasourceService';
import { DataSourceType } from '../types/datasource';
import { EVIL_PROM_DATASOURCE_REF, PROM_DATASOURCE_REF } from '../constants';

export function getInstancesFromMetricRunner(snapshotId: string, metricName = 'sys_cpu_utilization_rate'): SceneQueryRunner {
  const ds = dataSourceService.getCurrentDataSource();

  if (ds === DataSourceType.Prometheus) {
    // PromQL path: hardcoded expression
    return new SceneQueryRunner({
      datasource: PROM_DATASOURCE_REF,
      queries: [{
        refId: 'instances',
        expr: `group by (instance) (${metricName}{job="${snapshotId}"})`,
        legendFormat: '{{instance}}',
        instant: true,
      }],
    });
  }

  // SQL++ path: use CBQueryBuilder
  const builder = new CBQueryBuilder(snapshotId, metricName);
  builder.setExtraFields(['d.labels.instance']);
  return builder.buildQueryRunner();
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

export function getInstancesFromEvilPromMetricRunner(snapshotId: string): SceneQueryRunner {
  // This is a bit of a hack to get instance lists from Evil Prometheus without needing to define a new query language or builder.
  // We leverage the fact that Evil Prom supports PromQL syntax and just use a special datasource reference to route it correctly.
  return new SceneQueryRunner({
    datasource: EVIL_PROM_DATASOURCE_REF,
    queries: [{
      refId: 'instances',
      expr: `group by (instance) (sys_cpu_utilization_rate{job=~"${snapshotId}"})`,
      legendFormat: '{{instance}}',
      instant: true,
    }],
  });
}
