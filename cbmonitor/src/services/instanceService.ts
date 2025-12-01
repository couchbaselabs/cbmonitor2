import { SceneQueryRunner } from '@grafana/scenes';
import { CBQueryBuilder } from '../utils/utils.cbquery';

export function getInstancesFromMetricRunner(snapshotId: string, metricName = 'cm_http_requests_total'): SceneQueryRunner {
  const builder = new CBQueryBuilder(snapshotId, metricName);
  builder.setExtraFields(['d.labels.instance']);
  return builder.buildQueryRunner();
}

/**
 * Convenience util to parse instances from a data frame response.
 * Expects a single string column named `instance` or the first column.
 */
export function parseInstancesFromFrames(frames: any[]): string[] {
  if (!Array.isArray(frames) || frames.length === 0) return [];
  const set = new Set<string>();
  for (const frame of frames) {
    const fields = frame?.fields ?? [];
    // Prefer an explicitly named `instance` field, else take any string field
    const instanceField = fields.find((f: any) => f?.name === 'instance')
      ?? fields.find((f: any) => (f?.type?.name === 'string') || f?.type === 'string')
      ?? fields[0];
    const rawValues = instanceField?.values ?? [];
    const arr = (rawValues && typeof rawValues.toArray === 'function') ? rawValues.toArray() : Array.from(rawValues);
    for (const v of arr) {
      if (v) set.add(String(v));
    }
  }
  return Array.from(set);
}
