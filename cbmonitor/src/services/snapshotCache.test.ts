import { LocalStorageSnapshotCacheStore, SnapshotCacheEntry } from './snapshotCache';
import { SnapshotMetadata } from '../types/snapshot';

function makeMetadata(id: string, overrides: Partial<SnapshotMetadata> = {}): SnapshotMetadata {
    return {
        snapshotId: id,
        services: ['kv', 'query'],
        version: '7.6',
        ts_start: '2025-01-01T00:00:00Z',
        ts_end: '2025-01-01T01:00:00Z',
        phases: [],
        ...overrides,
    };
}

function makeEntry(id: string, lastAccessedAt: number, pinned = false): SnapshotCacheEntry {
    return {
        snapshotId: id,
        metadata: makeMetadata(id),
        cachedAt: lastAccessedAt,
        lastAccessedAt,
        pinned,
        sizeBytes: 0,
    };
}

describe('LocalStorageSnapshotCacheStore', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('round-trips an entry via put/get/peekSync', async () => {
        const store = new LocalStorageSnapshotCacheStore(() => 10);
        const entry = makeEntry('snap-1', 1000);
        await store.put(entry);

        const fetched = await store.get('snap-1');
        expect(fetched?.snapshotId).toBe('snap-1');
        expect(fetched?.metadata.version).toBe('7.6');
        expect(fetched?.sizeBytes).toBeGreaterThan(0);

        const sync = store.peekSync('snap-1');
        expect(sync?.snapshotId).toBe('snap-1');
    });

    it('evicts the oldest unpinned entry when over the limit', async () => {
        const store = new LocalStorageSnapshotCacheStore(() => 2);
        await store.put(makeEntry('a', 1000));
        await store.put(makeEntry('b', 2000));
        await store.put(makeEntry('c', 3000));

        const list = await store.list();
        const ids = list.map((e) => e.snapshotId);
        expect(ids).toContain('c');
        expect(ids).toContain('b');
        expect(ids).not.toContain('a');
    });

    it('skips pinned entries during LRU eviction', async () => {
        const store = new LocalStorageSnapshotCacheStore(() => 2);
        await store.put(makeEntry('a', 1000, true));
        await store.put(makeEntry('b', 2000));
        await store.put(makeEntry('c', 3000));

        const ids = (await store.list()).map((e) => e.snapshotId);
        expect(ids).toContain('a');
        expect(ids).toContain('c');
        expect(ids).not.toContain('b');
    });

    it('maxEntries=0 disables caching for unpinned entries', async () => {
        const store = new LocalStorageSnapshotCacheStore(() => 0);
        await store.put(makeEntry('a', 1000));
        expect(await store.get('a')).toBeNull();
        expect((await store.list()).length).toBe(0);
    });

    it('maxEntries=0 still keeps pinned entries', async () => {
        const store = new LocalStorageSnapshotCacheStore(() => 0);
        await store.put(makeEntry('a', 1000, true));
        expect(await store.get('a')).not.toBeNull();
    });

    it('enforceMaxEntries evicts everything unpinned when the cap drops to 0', async () => {
        let max = 10;
        const store = new LocalStorageSnapshotCacheStore(() => max);
        await store.put(makeEntry('a', 1000));
        await store.put(makeEntry('b', 2000, true));
        await store.put(makeEntry('c', 3000));

        max = 0;
        await store.enforceMaxEntries();

        const ids = (await store.list()).map((e) => e.snapshotId);
        expect(ids).toEqual(['b']);
    });

    it('touch updates lastAccessedAt so the next eviction protects the touched entry', async () => {
        const store = new LocalStorageSnapshotCacheStore(() => 2);
        await store.put(makeEntry('a', 1000));
        await store.put(makeEntry('b', 2000));

        // Touch 'a' so it becomes the most-recently-accessed.
        await store.touch('a');

        await store.put(makeEntry('c', 3000));

        const ids = (await store.list()).map((e) => e.snapshotId);
        expect(ids).toContain('a');
        expect(ids).toContain('c');
        expect(ids).not.toContain('b');
    });

    it('setPinned reflects in the index and entry', async () => {
        const store = new LocalStorageSnapshotCacheStore(() => 10);
        await store.put(makeEntry('a', 1000));
        await store.setPinned('a', true);

        const list = await store.list();
        expect(list[0].pinned).toBe(true);
        const entry = await store.get('a');
        expect(entry?.pinned).toBe(true);
    });

    it('clearAll wipes pinned and unpinned alike', async () => {
        const store = new LocalStorageSnapshotCacheStore(() => 10);
        await store.put(makeEntry('a', 1000, true));
        await store.put(makeEntry('b', 2000));
        await store.clearAll();
        expect((await store.list()).length).toBe(0);
        expect(await store.totalSizeBytes()).toBe(0);
    });

    it('delete removes a single entry but leaves the rest', async () => {
        const store = new LocalStorageSnapshotCacheStore(() => 10);
        await store.put(makeEntry('a', 1000));
        await store.put(makeEntry('b', 2000));
        await store.delete('a');
        const ids = (await store.list()).map((e) => e.snapshotId);
        expect(ids).toEqual(['b']);
    });

    it('list returns entries sorted by lastAccessedAt descending', async () => {
        const store = new LocalStorageSnapshotCacheStore(() => 10);
        await store.put(makeEntry('a', 1000));
        await store.put(makeEntry('b', 3000));
        await store.put(makeEntry('c', 2000));

        const ids = (await store.list()).map((e) => e.snapshotId);
        expect(ids).toEqual(['b', 'c', 'a']);
    });

    it('list reconciles dangling index rows whose entry blob is missing', async () => {
        const store = new LocalStorageSnapshotCacheStore(() => 10);
        await store.put(makeEntry('a', 1000));
        await store.put(makeEntry('b', 2000));

        // Simulate a dropped entry blob (e.g. quota eviction by browser).
        localStorage.removeItem('cbmonitor.snapshotCache.entry.a');

        const list = await store.list();
        expect(list.map((e) => e.snapshotId)).toEqual(['b']);
    });

    it('totalSizeBytes reflects what is in the index', async () => {
        const store = new LocalStorageSnapshotCacheStore(() => 10);
        await store.put(makeEntry('a', 1000));
        await store.put(makeEntry('b', 2000));
        const total = await store.totalSizeBytes();
        expect(total).toBeGreaterThan(0);
    });

    it('writing the same id replaces the existing entry without growing the index', async () => {
        const store = new LocalStorageSnapshotCacheStore(() => 10);
        await store.put(makeEntry('a', 1000));
        await store.put(makeEntry('a', 5000));

        const list = await store.list();
        expect(list.length).toBe(1);
        expect(list[0].lastAccessedAt).toBe(5000);
    });
});
