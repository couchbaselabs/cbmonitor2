import { snapshotService } from './snapshotService';
import { SnapshotMetadata } from '../types/snapshot';
import { findCommonServices } from '../config/services';

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
        snapshot = await snapshotService.getSnapshot(snapshotId);
        snapshotService.storeSnapshotData(snapshotId, snapshot);
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
