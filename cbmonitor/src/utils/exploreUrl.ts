import { locationUtil, serializeStateToUrlParam } from '@grafana/data';
import { PROM_DATASOURCE_REF } from '../constants';

export interface ExploreRange {
    from: string;
    to: string;
}

export interface BuildExploreUrlOptions {
    snapshotIds: string | string[];
    range: ExploreRange;
    /**
     * Optional PromQL expression. When omitted, a job-scoped vector selector is
     * used so the user can pick a metric from Prometheus autocomplete in Explore.
     */
    expr?: string;
    refId?: string;
}

/**
 * Build a Grafana Explore URL pre-filled with a job-scoped Prometheus query
 * and an absolute time range. Mirrors the URL format Grafana itself uses
 * via mapInternalLinkToExplore (`?left=<serialized state>`).
 */
export function buildExploreUrl(opts: BuildExploreUrlOptions): string {
    const ids = Array.isArray(opts.snapshotIds) ? opts.snapshotIds : [opts.snapshotIds];
    const jobMatcher = ids.length === 1
        ? `job="${ids[0]}"`
        : `job=~"${ids.map(escapeRegexAlternation).join('|')}"`;
    const expr = opts.expr ?? `{${jobMatcher}}`;

    const state = {
        datasource: PROM_DATASOURCE_REF.uid,
        queries: [{
            refId: opts.refId ?? 'A',
            expr,
            datasource: { ...PROM_DATASOURCE_REF },
        }],
        range: {
            from: toEpochMsString(opts.range.from),
            to: toEpochMsString(opts.range.to),
        },
    };

    const left = encodeURIComponent(serializeStateToUrlParam(state));
    return locationUtil.assureBaseUrl(`/explore?left=${left}`);
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

function escapeRegexAlternation(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
