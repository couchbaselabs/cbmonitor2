import { SceneTimeRange, SceneObjectUrlValues } from '@grafana/scenes';
import { dateTime, TimeOption } from '@grafana/data';
import { Phase, SnapshotMetadata } from '../types/snapshot';
import { LoadedSnapshot } from '../services/snapshotLoader';

/**
 * A custom SceneTimeRange that doesn't sync its state to the URL.
 */
export class NoUrlSyncTimeRange extends SceneTimeRange {
    public getUrlState(): SceneObjectUrlValues {
        return {};
    }
}

/**
 * Factory function to create a NoUrlSyncTimeRange instance with default or custom times.
 *
 * @param from - Start time (default: 'now-15m')
 * @param to - End time (default: 'now')
 * @returns A new NoUrlSyncTimeRange instance
 *
 * @example
 * // Create with defaults
 * const timeRange = createNoUrlSyncTimeRange();
 *
 * @example
 * // Create with custom range
 * const timeRange = createNoUrlSyncTimeRange('now-1h', 'now');
 *
 * @example
 * // Create with absolute times
 * const timeRange = createNoUrlSyncTimeRange('2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z');
 */
export function createNoUrlSyncTimeRange(from = 'now-15m', to = 'now'): NoUrlSyncTimeRange {
    return new NoUrlSyncTimeRange({ from, to });
}

/**
 * Build quick time range options from snapshot metadata, including full range and phases.
 *
 * @param metadata - Snapshot metadata containing time range and phases
 * @returns Array of TimeOption for quick range selection
 *
 * @example
 * const quickRanges = buildQuickRanges(snapshot.metadata);
 * const picker = new SceneTimePicker({ quickRanges });
 */
export function buildQuickRanges(metadata: SnapshotMetadata): TimeOption[] {
    const quickRanges: TimeOption[] = [
        {
            from: metadata.ts_start,
            to: metadata.ts_end,
            display: 'Full Snapshot Range',
        }
    ];

    if (metadata.phases && metadata.phases.length > 0) {
        metadata.phases.forEach((phase: Phase) => {
            quickRanges.push({
                from: phase.ts_start,
                to: phase.ts_end,
                display: `Phase: ${phase.label}`,
            });
        });
    }

    return quickRanges;
}

/**
 * Synchronize multiple time ranges to a specific phase label.
 * Useful for comparison views where you want all snapshots to show the same phase.
 *
 * @param timeRanges - Array of time range objects to synchronize
 * @param snapshots - Array of loaded snapshots containing phase metadata
 * @param phaseLabel - Label of the phase to sync to
 *
 * @example
 * syncTimeRangesToPhase(timeRanges, snapshots, 'Steady State');
 */
export function syncTimeRangesToPhase(
    timeRanges: SceneTimeRange[],
    snapshots: LoadedSnapshot[],
    phaseLabel: string
): void {
    const target = phaseLabel.trim().toLowerCase();
    timeRanges.forEach((tr, idx) => {
        const meta = snapshots[idx].metadata;
        const phases = Array.isArray(meta.phases) ? meta.phases : [];
        const match = phases.find((p: Phase) =>
            typeof p?.label === 'string' && p.label.trim().toLowerCase() === target
        );
        if (match && match.ts_start && match.ts_end) {
            tr.onTimeRangeChange({
                from: dateTime(match.ts_start),
                to: dateTime(match.ts_end),
                raw: { from: match.ts_start, to: match.ts_end }
            });
        }
    });
}

/**
 * Synchronize multiple time ranges to their full snapshot ranges.
 *
 * @param timeRanges - Array of time range objects to synchronize
 * @param snapshots - Array of loaded snapshots containing metadata
 *
 * @example
 * syncTimeRangesToFullRange(timeRanges, snapshots);
 */
export function syncTimeRangesToFullRange(
    timeRanges: SceneTimeRange[],
    snapshots: LoadedSnapshot[]
): void {
    timeRanges.forEach((tr, idx) => {
        const meta = snapshots[idx].metadata;
        if (meta.ts_start && meta.ts_end) {
            tr.onTimeRangeChange({
                from: dateTime(meta.ts_start),
                to: dateTime(meta.ts_end),
                raw: { from: meta.ts_start, to: meta.ts_end }
            });
        }
    });
}

/**
 * Initialize time range from snapshot metadata or a specific phase.
 *
 * @param timeRange - Time range object to initialize
 * @param metadata - Snapshot metadata
 * @param phaseLabel - Optional phase label to use instead of full range
 *
 * @example
 * initializeTimeRange(timeRange, snapshot.metadata, 'Steady State');
 */
export function initializeTimeRange(
    timeRange: SceneTimeRange,
    metadata: SnapshotMetadata,
    phaseLabel?: string
): void {
    let from = metadata.ts_start;
    let to = metadata.ts_end;

    // If a phase is specified, use that phase's time range
    if (phaseLabel && metadata.phases) {
        const selectedPhase = metadata.phases.find((p: Phase) => p.label === phaseLabel);
        if (selectedPhase) {
            from = selectedPhase.ts_start;
            to = selectedPhase.ts_end;
        }
    }

    timeRange.onTimeRangeChange({
        from: dateTime(from),
        to: dateTime(to),
        raw: { from, to }
    });
}
