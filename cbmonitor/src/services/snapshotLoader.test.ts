import { loadSnapshot } from './snapshotLoader';
import { snapshotService } from './snapshotService';
import { SERVICE_CONFIGS } from '../config/services';

jest.mock('./snapshotService', () => ({
    snapshotService: {
        getStoredSnapshotData: jest.fn(),
        getSnapshot: jest.fn(),
        storeSnapshotData: jest.fn(),
    },
}));

const mockedSnapshotService = snapshotService as jest.Mocked<typeof snapshotService>;

describe('loadSnapshot fallback behavior', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedSnapshotService.getStoredSnapshotData.mockReturnValue(null);
    });

    it('synthesizes a fallback when getSnapshot rejects with a non-404 error', async () => {
        mockedSnapshotService.getSnapshot.mockRejectedValue(
            new Error('Failed to fetch snapshot abc: HTTP 503 Service Unavailable')
        );

        const before = Date.now();
        const loaded = await loadSnapshot('abc');
        const after = Date.now();

        expect(loaded.id).toBe('abc');
        expect(loaded.metadata.snapshotId).toBe('abc');
        expect(loaded.metadata.phases).toEqual([]);
        expect(loaded.metadata.services.length).toBeGreaterThan(0);

        const tsStart = Date.parse(loaded.metadata.ts_start);
        const tsEnd = Date.parse(loaded.metadata.ts_end);
        expect(Number.isNaN(tsStart)).toBe(false);
        expect(Number.isNaN(tsEnd)).toBe(false);

        // End ≈ now (within a generous window for test slop), window ≈ 15m.
        expect(tsEnd).toBeGreaterThanOrEqual(before - 1000);
        expect(tsEnd).toBeLessThanOrEqual(after + 1000);
        const windowMs = tsEnd - tsStart;
        expect(windowMs).toBeGreaterThanOrEqual(15 * 60 * 1000 - 1000);
        expect(windowMs).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
    });

    it('does not persist the fallback to session storage', async () => {
        mockedSnapshotService.getSnapshot.mockRejectedValue(
            new Error('Failed to fetch snapshot abc: HTTP 500 Internal Server Error')
        );

        await loadSnapshot('abc');
        expect(mockedSnapshotService.storeSnapshotData).not.toHaveBeenCalled();
    });

    it('rethrows when the snapshot is genuinely not found (HTTP 404)', async () => {
        const err = new Error(
            'Failed to fetch snapshot ghost: HTTP 404 Not Found - {"error":"Snapshot not found: ghost"}'
        );
        mockedSnapshotService.getSnapshot.mockRejectedValue(err);

        await expect(loadSnapshot('ghost')).rejects.toBe(err);
    });

    it('populates services from SERVICE_CONFIGS in fallback metadata', async () => {
        mockedSnapshotService.getSnapshot.mockRejectedValue(new Error('HTTP 503'));

        const loaded = await loadSnapshot('xyz');
        const expected = SERVICE_CONFIGS.map((c) => c.key);
        expect(loaded.metadata.services).toEqual(expected);
    });

    it('returns cached snapshot data when available without calling getSnapshot', async () => {
        const cached = {
            metadata: {
                snapshotId: 'cached',
                services: ['kv'],
                version: '1.0',
                ts_start: '2025-01-01T00:00:00Z',
                ts_end: '2025-01-01T01:00:00Z',
                phases: [],
            },
            data: {},
        };
        mockedSnapshotService.getStoredSnapshotData.mockReturnValue(cached);

        const loaded = await loadSnapshot('cached');
        expect(loaded.metadata).toEqual(cached.metadata);
        expect(mockedSnapshotService.getSnapshot).not.toHaveBeenCalled();
    });

    it('returns real metadata when getSnapshot succeeds', async () => {
        const real = {
            metadata: {
                snapshotId: 'real',
                services: ['kv', 'index'],
                version: '7.6',
                ts_start: '2025-02-01T00:00:00Z',
                ts_end: '2025-02-01T01:00:00Z',
                phases: [{ label: 'access', ts_start: '2025-02-01T00:10:00Z', ts_end: '2025-02-01T00:40:00Z' }],
            },
            data: {},
        };
        mockedSnapshotService.getSnapshot.mockResolvedValue(real);

        const loaded = await loadSnapshot('real');
        expect(loaded.metadata).toEqual(real.metadata);
        expect(mockedSnapshotService.storeSnapshotData).toHaveBeenCalledWith('real', real);
    });
});
