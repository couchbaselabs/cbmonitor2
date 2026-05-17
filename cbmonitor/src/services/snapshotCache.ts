import { SnapshotMetadata } from '../types/snapshot';
import { getMaxCachedSnapshotsPref } from '../userPrefs';

/**
 * Per-snapshot cache record persisted to local storage.
 *
 * The `metrics` field is reserved for the iteration-2 offline-metrics feature.
 * It is declared optional so the storage schema is forward-compatible — today's
 * code ignores it; tomorrow's code can populate it without migration.
 */
export interface SnapshotCacheEntry {
    snapshotId: string;
    metadata: SnapshotMetadata;
    metrics?: Record<string, unknown>;
    cachedAt: number;
    lastAccessedAt: number;
    pinned: boolean;
    sizeBytes: number;
}

/**
 * Lightweight index row tracked separately from the heavy entry blob so the
 * preferences-page list, `touch`, and pin operations don't need to deserialise
 * the full metadata on every interaction.
 */
interface SnapshotCacheIndexRow {
    snapshotId: string;
    cachedAt: number;
    lastAccessedAt: number;
    pinned: boolean;
    sizeBytes: number;
}

/**
 * Storage abstraction for snapshot cache entries.
 *
 * Methods are async so a future IndexedDB-backed implementation can swap in
 * without breaking callers. `peekSync` is the one synchronous escape hatch,
 * used by scene data layers whose `runLayer()` cannot await.
 */
export interface SnapshotCacheStore {
    get(id: string): Promise<SnapshotCacheEntry | null>;
    put(entry: SnapshotCacheEntry): Promise<void>;
    delete(id: string): Promise<void>;
    list(): Promise<SnapshotCacheEntry[]>;
    clearAll(): Promise<void>;
    setPinned(id: string, pinned: boolean): Promise<void>;
    touch(id: string): Promise<void>;
    totalSizeBytes(): Promise<number>;
    /**
     * Apply the current max-entries preference. Evicts the oldest unpinned
     * entries until the count fits. Call after the user changes the knob.
     */
    enforceMaxEntries(): Promise<void>;
    /**
     * Synchronous read for callers that cannot await (e.g. SceneDataLayer
     * `runLayer`). Backed by localStorage today. When iteration 2 moves the
     * backend to IndexedDB, this method will need an in-memory mirror.
     */
    peekSync(id: string): SnapshotCacheEntry | null;
}

const NAMESPACE = 'cbmonitor.snapshotCache.';
const INDEX_KEY = `${NAMESPACE}index`;
const ENTRY_PREFIX = `${NAMESPACE}entry.`;

function entryKey(id: string): string {
    return `${ENTRY_PREFIX}${id}`;
}

function safeRead(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeWrite(key: string, value: string): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function safeRemove(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

function isQuotaError(err: unknown): boolean {
    if (!(err instanceof Error)) {
        return false;
    }
    return err.name === 'QuotaExceededError' || /quota/i.test(err.message);
}

export class LocalStorageSnapshotCacheStore implements SnapshotCacheStore {
    private readMaxEntries: () => number;

    constructor(readMaxEntries: () => number = getMaxCachedSnapshotsPref) {
        this.readMaxEntries = readMaxEntries;
    }

    private readIndex(): SnapshotCacheIndexRow[] {
        const raw = safeRead(INDEX_KEY);
        if (!raw) {
            return [];
        }
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed.filter((r) => r && typeof r.snapshotId === 'string');
        } catch {
            return [];
        }
    }

    private writeIndex(rows: SnapshotCacheIndexRow[]): void {
        safeWrite(INDEX_KEY, JSON.stringify(rows));
    }

    private readEntry(id: string): SnapshotCacheEntry | null {
        const raw = safeRead(entryKey(id));
        if (!raw) {
            return null;
        }
        try {
            return JSON.parse(raw) as SnapshotCacheEntry;
        } catch {
            return null;
        }
    }

    peekSync(id: string): SnapshotCacheEntry | null {
        return this.readEntry(id);
    }

    async get(id: string): Promise<SnapshotCacheEntry | null> {
        return this.readEntry(id);
    }

    async list(): Promise<SnapshotCacheEntry[]> {
        const rows = this.readIndex().slice().sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
        const entries: SnapshotCacheEntry[] = [];
        const dangling: string[] = [];
        for (const row of rows) {
            const entry = this.readEntry(row.snapshotId);
            if (entry) {
                entries.push(entry);
            } else {
                dangling.push(row.snapshotId);
            }
        }
        if (dangling.length > 0) {
            const fresh = rows.filter((r) => !dangling.includes(r.snapshotId));
            this.writeIndex(fresh);
        }
        return entries;
    }

    async totalSizeBytes(): Promise<number> {
        return this.readIndex().reduce((acc, row) => acc + (row.sizeBytes || 0), 0);
    }

    async put(entry: SnapshotCacheEntry): Promise<void> {
        const maxEntries = this.readMaxEntries();
        if (maxEntries <= 0 && !entry.pinned) {
            // Caching disabled. Make sure any stale row is also removed.
            await this.delete(entry.snapshotId);
            return;
        }

        const sized: SnapshotCacheEntry = {
            ...entry,
            sizeBytes: JSON.stringify(entry).length,
        };

        if (!this.writeEntry(sized)) {
            // Quota hit. Try evicting one unpinned entry and retry once.
            const evicted = this.evictOldestUnpinned([sized.snapshotId]);
            if (evicted == null || !this.writeEntry(sized)) {
                console.warn(
                    `snapshotCache: failed to persist entry for ${sized.snapshotId} (quota?). Entry not cached.`
                );
                return;
            }
        }

        const rows = this.readIndex();
        const next = rows.filter((r) => r.snapshotId !== sized.snapshotId);
        next.push({
            snapshotId: sized.snapshotId,
            cachedAt: sized.cachedAt,
            lastAccessedAt: sized.lastAccessedAt,
            pinned: sized.pinned,
            sizeBytes: sized.sizeBytes,
        });
        this.writeIndex(next);

        this.evictDownTo(maxEntries, sized.snapshotId);
    }

    private writeEntry(entry: SnapshotCacheEntry): boolean {
        try {
            localStorage.setItem(entryKey(entry.snapshotId), JSON.stringify(entry));
            return true;
        } catch (err) {
            if (isQuotaError(err)) {
                return false;
            }
            return false;
        }
    }

    /**
     * Evict the oldest unpinned entry. Used as a quota-recovery step.
     * Returns the id of the evicted entry, or null if nothing evictable was found.
     */
    private evictOldestUnpinned(excludeIds: string[] = []): string | null {
        const rows = this.readIndex();
        const candidates = rows
            .filter((r) => !r.pinned && !excludeIds.includes(r.snapshotId))
            .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
        const victim = candidates[0];
        if (!victim) {
            return null;
        }
        safeRemove(entryKey(victim.snapshotId));
        this.writeIndex(rows.filter((r) => r.snapshotId !== victim.snapshotId));
        return victim.snapshotId;
    }

    /**
     * Evict unpinned entries (oldest first) until the index size is at most
     * `maxEntries`. `protectId` is never evicted (it's the one we just wrote).
     */
    private evictDownTo(maxEntries: number, protectId?: string): void {
        if (maxEntries < 0) {
            return;
        }
        const rows = this.readIndex();
        if (rows.length <= maxEntries) {
            return;
        }
        const candidates = rows
            .filter((r) => !r.pinned && r.snapshotId !== protectId)
            .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
        const toEvict: string[] = [];
        let total = rows.length;
        for (const row of candidates) {
            if (total <= maxEntries) {
                break;
            }
            toEvict.push(row.snapshotId);
            total--;
        }
        if (toEvict.length === 0) {
            return;
        }
        toEvict.forEach((id) => safeRemove(entryKey(id)));
        this.writeIndex(rows.filter((r) => !toEvict.includes(r.snapshotId)));
    }

    async enforceMaxEntries(): Promise<void> {
        const max = this.readMaxEntries();
        if (max <= 0) {
            // Caching disabled: remove every unpinned entry.
            const rows = this.readIndex();
            const toRemove = rows.filter((r) => !r.pinned).map((r) => r.snapshotId);
            toRemove.forEach((id) => safeRemove(entryKey(id)));
            this.writeIndex(rows.filter((r) => r.pinned));
            return;
        }
        this.evictDownTo(max);
    }

    async delete(id: string): Promise<void> {
        safeRemove(entryKey(id));
        const rows = this.readIndex();
        this.writeIndex(rows.filter((r) => r.snapshotId !== id));
    }

    async clearAll(): Promise<void> {
        const rows = this.readIndex();
        rows.forEach((r) => safeRemove(entryKey(r.snapshotId)));
        safeRemove(INDEX_KEY);
    }

    async setPinned(id: string, pinned: boolean): Promise<void> {
        const rows = this.readIndex();
        let changed = false;
        const next = rows.map((r) => {
            if (r.snapshotId === id && r.pinned !== pinned) {
                changed = true;
                return { ...r, pinned };
            }
            return r;
        });
        if (!changed) {
            return;
        }
        this.writeIndex(next);
        const entry = this.readEntry(id);
        if (entry) {
            entry.pinned = pinned;
            this.writeEntry(entry);
        }
    }

    async touch(id: string): Promise<void> {
        const rows = this.readIndex();
        const now = Date.now();
        let changed = false;
        const next = rows.map((r) => {
            if (r.snapshotId === id) {
                changed = true;
                return { ...r, lastAccessedAt: now };
            }
            return r;
        });
        if (changed) {
            this.writeIndex(next);
        }
    }
}

export const snapshotCacheStore: SnapshotCacheStore = new LocalStorageSnapshotCacheStore();
