import { API_BASE_URL } from '../constants';

interface MetricNamesApiResponse {
    success: boolean;
    snapshot: string;
    names: string[];
    truncated?: boolean;
    error?: string;
}

export interface DiscoveredCustomMetrics {
    names: string[];
    truncated: boolean;
}

const cache = new Map<string, DiscoveredCustomMetrics>();

/**
 * Module-level cache key: snapshotId + match regex. The viewer page
 * pre-fetches once during snapshot load and builders read synchronously.
 */
function cacheKey(snapshotId: string, match: string): string {
    return `${snapshotId}::${match}`;
}

/**
 * Fetch metric names matching `match` for the given snapshot. The backend
 * scopes the query to the snapshot's job and time window. Results are
 * cached per (snapshotId, match) so repeat callers (e.g. the builder
 * driver) don't re-hit the network.
 */
export async function discoverCustomMetricNames(
    snapshotId: string,
    match: string,
): Promise<DiscoveredCustomMetrics> {
    const key = cacheKey(snapshotId, match);
    const cached = cache.get(key);
    if (cached) {
        return cached;
    }

    const params = new URLSearchParams({ match });
    const url = `${API_BASE_URL}/snapshots/${encodeURIComponent(snapshotId)}/metric-names?${params.toString()}`;
    const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });

    if (!response.ok) {
        const raw = await response.text();
        throw new Error(`metric-names ${response.status}: ${raw || response.statusText}`);
    }

    const json: MetricNamesApiResponse = await response.json();
    if (!json.success) {
        throw new Error(json.error || 'metric-names discovery failed');
    }

    const result: DiscoveredCustomMetrics = {
        names: json.names ?? [],
        truncated: Boolean(json.truncated),
    };
    cache.set(key, result);
    return result;
}

/** Synchronous read; returns null if no entry is cached for this pair. */
export function getCachedCustomMetricNames(snapshotId: string, match: string): DiscoveredCustomMetrics | null {
    return cache.get(cacheKey(snapshotId, match)) ?? null;
}

/** Drop any cached entries for a snapshot. Used when its metadata is refreshed. */
export function clearCustomMetricNamesCache(snapshotId?: string): void {
    if (!snapshotId) {
        cache.clear();
        return;
    }
    const prefix = `${snapshotId}::`;
    for (const k of [...cache.keys()]) {
        if (k.startsWith(prefix)) {
            cache.delete(k);
        }
    }
}
