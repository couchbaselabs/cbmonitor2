import { isSnapshotViewerPath, parseSnapshotIdFromPath } from './utils.routing';

describe('isSnapshotViewerPath', () => {
    it('is true for a snapshot viewer path with an id', () => {
        expect(isSnapshotViewerPath('/a/cbmonitor/snapshots/snap-123')).toBe(true);
    });

    it('is true for a viewer path with a tab/drilldown suffix', () => {
        expect(isSnapshotViewerPath('/a/cbmonitor/snapshots/snap-123/kv')).toBe(true);
    });

    it('is true for the placeholder segment (still nominally the viewer route)', () => {
        expect(isSnapshotViewerPath('/a/cbmonitor/snapshots/_')).toBe(true);
    });

    it('is false for the bare search/landing path (no trailing segment)', () => {
        expect(isSnapshotViewerPath('/a/cbmonitor/snapshots')).toBe(false);
    });

    it('is false for a completely different route (e.g. navigated away to Compare)', () => {
        expect(isSnapshotViewerPath('/a/cbmonitor/compare')).toBe(false);
    });

    it('is false for the preferences route', () => {
        expect(isSnapshotViewerPath('/a/cbmonitor/preferences')).toBe(false);
    });
});

describe('parseSnapshotIdFromPath', () => {
    it('extracts the id from a viewer path', () => {
        expect(parseSnapshotIdFromPath('/a/cbmonitor/snapshots/snap-123')).toBe('snap-123');
    });

    it('returns undefined for the bare search path', () => {
        expect(parseSnapshotIdFromPath('/a/cbmonitor/snapshots')).toBeUndefined();
    });

    it('returns undefined for an unrelated route', () => {
        expect(parseSnapshotIdFromPath('/a/cbmonitor/compare')).toBeUndefined();
    });
});
