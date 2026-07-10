import { snapshotService } from './snapshotService';
import { LocalStorageSnapshotCacheStore } from './snapshotCache';
import { SnapshotData } from '../types/snapshot';

function makeData(id: string, version = '7.6'): SnapshotData {
    return {
        metadata: {
            snapshotId: id,
            services: ['kv'],
            version,
            ts_start: '2025-01-01T00:00:00Z',
            ts_end: '2025-01-01T01:00:00Z',
            phases: [],
        },
        data: {},
    };
}

describe('snapshotService refresh', () => {
    const originalFetch = (globalThis as { fetch?: typeof fetch }).fetch;

    beforeEach(() => {
        localStorage.clear();
        try {
            sessionStorage.clear();
        } catch {
            // ignore
        }
        snapshotService._setCacheForTests(new LocalStorageSnapshotCacheStore(() => 10));
    });

    afterEach(() => {
        (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
    });

    function mockFetchSequence(...payloads: SnapshotData[]) {
        let call = 0;
        (globalThis as { fetch?: typeof fetch }).fetch = (async () => {
            const data = payloads[Math.min(call, payloads.length - 1)];
            call++;
            return {
                ok: true,
                json: async () => ({ success: true, data }),
            } as Response;
        }) as typeof fetch;
    }

    it('refresh re-fetches and replaces the cached entry', async () => {
        mockFetchSequence(makeData('snap-1', 'v1'), makeData('snap-1', 'v2'));

        const first = await snapshotService.getSnapshot('snap-1');
        await snapshotService.storeSnapshotData('snap-1', first);
        expect(snapshotService.getStoredSnapshotData('snap-1')?.metadata.version).toBe('v1');

        const refreshed = await snapshotService.refresh('snap-1');
        expect(refreshed.metadata.version).toBe('v2');
        expect(snapshotService.getStoredSnapshotData('snap-1')?.metadata.version).toBe('v2');
    });

    it('refresh bypasses the backend cache via ?refresh=true', async () => {
        const calledUrls: string[] = [];
        (globalThis as { fetch?: typeof fetch }).fetch = (async (url: string) => {
            calledUrls.push(url);
            return {
                ok: true,
                json: async () => ({ success: true, data: makeData('snap-1') }),
            } as Response;
        }) as typeof fetch;

        await snapshotService.refresh('snap-1');

        // refresh() also fires the (unrelated) annotation-sync POST; only
        // the snapshot GET needs the cache-bypass param.
        const snapshotGetUrl = calledUrls.find((u) => u.endsWith(`snap-1?refresh=true`));
        expect(snapshotGetUrl).toBeDefined();
    });

    it('a plain getSnapshot call does not set the cache-bypass param', async () => {
        const calledUrls: string[] = [];
        (globalThis as { fetch?: typeof fetch }).fetch = (async (url: string) => {
            calledUrls.push(url);
            return {
                ok: true,
                json: async () => ({ success: true, data: makeData('snap-1') }),
            } as Response;
        }) as typeof fetch;

        await snapshotService.getSnapshot('snap-1');

        expect(calledUrls).toHaveLength(1);
        expect(calledUrls[0]).not.toContain('refresh=true');
    });

    it('refresh emits a snapshotRefreshed event with the snapshot id', async () => {
        mockFetchSequence(makeData('snap-1'));

        const listener = jest.fn();
        const unsubscribe = snapshotService.onSnapshotRefreshed(listener);

        await snapshotService.refresh('snap-1');

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith('snap-1');

        unsubscribe();
        await snapshotService.refresh('snap-1');
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('storeSnapshotData preserves an existing pin flag across re-stores', async () => {
        const data = makeData('snap-1', 'v1');
        await snapshotService.storeSnapshotData('snap-1', data);

        // Manually pin via the underlying cache (the UI would do this).
        const cache = new LocalStorageSnapshotCacheStore(() => 10);
        await cache.setPinned('snap-1', true);

        snapshotService._setCacheForTests(cache);
        await snapshotService.storeSnapshotData('snap-1', makeData('snap-1', 'v2'));

        const entry = cache.peekSync('snap-1');
        expect(entry?.pinned).toBe(true);
        expect(entry?.metadata.version).toBe('v2');
    });

    it('listeners can be unsubscribed via the returned function', async () => {
        mockFetchSequence(makeData('snap-1'));

        const listener = jest.fn();
        const unsubscribe = snapshotService.onSnapshotRefreshed(listener);
        unsubscribe();

        await snapshotService.refresh('snap-1');
        expect(listener).not.toHaveBeenCalled();
    });
});
