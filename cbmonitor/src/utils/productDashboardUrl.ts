import { locationUtil } from '@grafana/data';
import { PROM_DATASOURCE_REF } from '../constants';

export interface ProductDashboardRange {
    from: string;
    to: string;
}

export interface BuildProductDashboardUrlOptions {
    /**
     * Grafana-supplied dashboard URL (e.g. "/d/<uid>/<slug>"), as returned by
     * `/api/search`. Used as-is for the base path so we don't need to know
     * the slug or rebuild it from the title.
     */
    dashboardUrl: string;
    snapshotId: string;
    range: ProductDashboardRange;
    datasourceUid?: string;
}

/**
 * Build a deep link to a user-maintained product dashboard with the snapshot's
 * time range, `var-job` (= snapshot ID), and `var-ds` (Prometheus datasource UID)
 * pre-filled. The target dashboard is responsible for using `$job` / `$ds`
 * template variables in its queries.
 */
export function buildProductDashboardUrl(opts: BuildProductDashboardUrlOptions): string {
    const dsUid = opts.datasourceUid ?? PROM_DATASOURCE_REF.uid;
    const params = new URLSearchParams();
    params.set('from', toEpochMsString(opts.range.from));
    params.set('to', toEpochMsString(opts.range.to));
    params.set('var-ds', dsUid);
    params.set('var-job', opts.snapshotId);
    return locationUtil.assureBaseUrl(`${opts.dashboardUrl}?${params.toString()}`);
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
