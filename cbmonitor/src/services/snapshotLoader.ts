import { snapshotService } from './snapshotService';
import { SnapshotData, SnapshotMetadata } from '../types/snapshot';
import { findCommonServices } from '../config/services';
import { PRODUCT_CONFIGS, resolveProducts } from '../config/products';

const FALLBACK_WINDOW_MS = 15 * 60 * 1000;

function isSnapshotNotFoundError(err: unknown): boolean {
    if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        return msg.includes('http 404') || msg.includes('not found');
    }
    return false;
}

function buildFallbackSnapshot(snapshotId: string): SnapshotData {
    const end = new Date();
    const start = new Date(end.getTime() - FALLBACK_WINDOW_MS);
    return {
        metadata: {
            snapshotId,
            services: [],
            version: '',
            ts_start: start.toISOString(),
            ts_end: end.toISOString(),
            phases: [],
        },
        data: {},
    };
}

/**
 * A snapshot with its metadata exposed for convenience
 */
export interface LoadedSnapshot {
    id: string;
    snapshot: any;
    metadata: SnapshotMetadata;
}

/**
 * Load a single snapshot with caching.
 * Checks local cache first, then fetches from API if needed.
 *
 * @param snapshotId - Snapshot ID to load
 * @returns Promise with loaded snapshot data
 *
 * @example
 * const loaded = await loadSnapshot('abc-123');
 * console.log(loaded.metadata.services);
 */
export async function loadSnapshot(snapshotId: string): Promise<LoadedSnapshot> {
    let snapshot = snapshotService.getStoredSnapshotData(snapshotId);

    if (!snapshot) {
        try {
            snapshot = await snapshotService.getSnapshot(snapshotId);
            await snapshotService.storeSnapshotData(snapshotId, snapshot);
        } catch (err) {
            if (isSnapshotNotFoundError(err)) {
                throw err;
            }
            // Metadata unavailable (snapshots feature disabled or transient
            // fetch error). Synthesize a fallback window so panels can still
            // render — the backend honors the same convention on its side.
            // Do not persist the fallback so a later navigation will retry.
            console.warn(
                `Snapshot metadata unavailable for ${snapshotId}; using a ${FALLBACK_WINDOW_MS / 60000}-minute fallback window.`,
                err
            );
            snapshot = buildFallbackSnapshot(snapshotId);
        }
    }

    return {
        id: snapshotId,
        snapshot,
        metadata: snapshot.metadata
    };
}

/**
 * Load multiple snapshots concurrently.
 * Each snapshot is cached individually.
 *
 * @param snapshotIds - Array of snapshot IDs to load
 * @returns Promise with array of loaded snapshots
 *
 * @example
 * const snapshots = await loadSnapshots(['abc-123', 'def-456']);
 */
export async function loadSnapshots(snapshotIds: string[]): Promise<LoadedSnapshot[]> {
    return Promise.all(snapshotIds.map(id => loadSnapshot(id)));
}

/**
 * Find services that are common to all loaded snapshots.
 * Normalizes service names and handles aliases.
 *
 * @param snapshots - Array of loaded snapshots
 * @returns Array of canonical service keys present in all snapshots
 *
 * @example
 * const common = findCommonServicesInSnapshots([snapshot1, snapshot2]);
 * // Returns: ['system', 'kv', 'query', 'cluster_manager']
 */
export function findCommonServicesInSnapshots(snapshots: LoadedSnapshot[]): string[] {
    const serviceLists = snapshots.map(s => s.metadata.services);
    return findCommonServices(serviceLists);
}

/**
 * Find the products common to all loaded snapshots, in plugin registry order.
 * Drives which product-owned tabs the comparison view shows.
 *
 * @param snapshots - Array of loaded snapshots
 * @returns Canonical product keys present in every snapshot, registry order
 */
export function findCommonProductsInSnapshots(snapshots: LoadedSnapshot[]): string[] {
    if (snapshots.length === 0) {
        return [];
    }
    const productSets = snapshots.map(
        (s) => new Set(resolveProducts(s.metadata.products).map((p) => p.key))
    );
    return PRODUCT_CONFIGS
        .map((c) => c.key)
        .filter((key) => productSets.every((set) => set.has(key)));
}

/**
 * Find phase labels that are common to all loaded snapshots.
 * Matches phases by label (case-insensitive, trimmed).
 *
 * @param snapshots - Array of loaded snapshots
 * @returns Array of common phase labels in the order from first snapshot
 *
 * @example
 * const phases = findCommonPhasesInSnapshots([snapshot1, snapshot2]);
 * // Returns: ['Load', 'Steady State', 'Drain']
 */
export function findCommonPhasesInSnapshots(snapshots: LoadedSnapshot[]): string[] {
    if (snapshots.length === 0) {
        return [];
    }

    // Get normalized phase label sets from each snapshot
    const phaseLabelSets = snapshots.map((s) => {
        const phases = Array.isArray(s.metadata.phases) ? s.metadata.phases : [];
        return new Set(
            phases
                .map((p: any) => (typeof p?.label === 'string' ? p.label.trim().toLowerCase() : ''))
                .filter((lbl: string) => lbl.length > 0)
        );
    });

    // Find common normalized labels
    const commonPhaseNorms = phaseLabelSets.length > 0
        ? [...phaseLabelSets[0]].filter((lbl) => phaseLabelSets.every((set) => set.has(lbl)))
        : [];

    // Get original-case labels from first snapshot in their original order
    const firstLabelsOrdered: string[] = (Array.isArray(snapshots[0].metadata.phases)
        ? snapshots[0].metadata.phases
        : [])
        .map((p: any) => (typeof p?.label === 'string' ? p.label : ''))
        .filter((lbl: string) => lbl.length > 0);

    // Filter to only common phases, preserving order and removing duplicates
    const commonPhases = firstLabelsOrdered
        .filter((lbl) => commonPhaseNorms.includes(lbl.trim().toLowerCase()))
        .filter((v, i, arr) => arr.indexOf(v) === i);

    return commonPhases;
}

/**
 * Build a formatted info message about loaded snapshots.
 * Useful for displaying snapshot details in UI.
 *
 * @param snapshots - Array of loaded snapshots
 * @returns Formatted string with snapshot information
 */
export function formatSnapshotInfo(snapshots: LoadedSnapshot[]): string {
    return snapshots.map((s, idx) => {
        const meta = s.metadata;
        return `${idx + 1}. Snapshot ID: ${s.id}\n   Services: ${meta.services.join(', ')}\n   Time Range: ${meta.ts_start} to ${meta.ts_end}`;
    }).join('\n\n');
}

/**
 * Compute the maximum duration among a list of snapshot metadata.
 * Returns the largest (ts_end - ts_start) found, or 0 if none.
 *
 * @param metadatas - Array of SnapshotMetadata objects
 * @returns The maximum duration in milliseconds
 */
export function getMaxSnapshotDuration(metadatas: SnapshotMetadata[]): number {
    let maxDuration = 0;
    for (const meta of metadatas) {
        if (meta.ts_start && meta.ts_end) {
            const start = Date.parse(meta.ts_start);
            const end = Date.parse(meta.ts_end);
            if (!isNaN(start) && !isNaN(end)) {
                const duration = end - start;
                if (duration > maxDuration) {
                    maxDuration = duration;
                }
            }
        }
    }
    return maxDuration;
}
