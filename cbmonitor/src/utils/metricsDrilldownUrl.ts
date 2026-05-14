import { locationUtil } from '@grafana/data';
import { PROM_DATASOURCE_REF } from '../constants';

export const METRICS_DRILLDOWN_PLUGIN_ID = 'grafana-metricsdrilldown-app';
const METRICS_DRILLDOWN_PATH = `/a/${METRICS_DRILLDOWN_PLUGIN_ID}/drilldown`;

export interface MetricsDrilldownRange {
    from: string;
    to: string;
}

export interface BuildMetricsDrilldownUrlOptions {
    snapshotId: string;
    range: MetricsDrilldownRange;
    datasourceUid?: string;
}

/**
 * Build a deep link to Grafana's Metrics Drilldown app (`grafana-metricsdrilldown-app`)
 * pre-filtered to a snapshot's job label and time range.
 */
export function buildMetricsDrilldownUrl(opts: BuildMetricsDrilldownUrlOptions): string {
    const dsUid = opts.datasourceUid ?? PROM_DATASOURCE_REF.uid;
    const params = new URLSearchParams();
    params.set('from', toEpochMsString(opts.range.from));
    params.set('to', toEpochMsString(opts.range.to));
    params.set('var-ds', dsUid);
    params.append('var-filters', `job|=|${opts.snapshotId}`);
    return locationUtil.assureBaseUrl(`${METRICS_DRILLDOWN_PATH}?${params.toString()}`);
}

function toEpochMsString(input: string): string {
    if (!input) {
        return input;
    }
    if (input.startsWith('now')) {
        return input;
    }
    const parsed = Date.parse(input);
    if (Number.isFinite(parsed)) {
        return String(parsed);
    }
    return input;
}
