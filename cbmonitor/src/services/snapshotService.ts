import { SnapshotData, SnapshotApiResponse } from '../types/snapshot';
import { API_BASE_URL } from '../constants';
import { snapshotCacheStore, SnapshotCacheStore, SnapshotCacheEntry } from './snapshotCache';

type RefreshListener = (snapshotId: string) => void;

const CURRENT_ID_KEY = 'cbmonitor_current_snapshot';

class SnapshotService {
  private readonly maxSnapshotFetchAttempts = 3;
  private cache: SnapshotCacheStore = snapshotCacheStore;
  private listeners = new Set<RefreshListener>();

  /** Override the cache backend. Used in tests. */
  _setCacheForTests(store: SnapshotCacheStore): void {
    this.cache = store;
  }

  private async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Fetch snapshot metadata by snapshot ID
   */
  async getSnapshot(snapshotId: string): Promise<SnapshotData> {
    const url = `${API_BASE_URL}/snapshots/${snapshotId}`;

    for (let attempt = 1; attempt <= this.maxSnapshotFetchAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const canRetry = response.status >= 500 && response.status < 600 && attempt < this.maxSnapshotFetchAttempts;

          if (canRetry) {
            const retryDelayMs = attempt * 300;
            console.warn(
              `Snapshot fetch failed with ${response.status}. Retrying in ${retryDelayMs}ms...`
            );
            await this.wait(retryDelayMs);
            continue;
          }

          const rawError = await response.text();
          const suffix = rawError ? ` - ${rawError}` : '';
          throw new Error(
            `Failed to fetch snapshot ${snapshotId}: HTTP ${response.status} ${response.statusText}${suffix}`
          );
        }

        const apiResponse: SnapshotApiResponse = await response.json();

        if (!apiResponse.success) {
          throw new Error(apiResponse.error || 'Unknown API error');
        }

        return apiResponse.data;
      } catch (error) {
        const isLastAttempt = attempt === this.maxSnapshotFetchAttempts;
        const isRetryableNetworkError = error instanceof TypeError;

        if (isRetryableNetworkError && !isLastAttempt) {
          const retryDelayMs = attempt * 300;
          console.warn(
            `Snapshot fetch encountered a network error. Retrying in ${retryDelayMs}ms...`,
            error
          );
          await this.wait(retryDelayMs);
          continue;
        }
        console.error(`Error fetching snapshot ${snapshotId}:`, error);
        throw error;
      }
    }

    throw new Error(`Failed to fetch snapshot ${snapshotId}: exhausted retry attempts`);
  }

  /**
   * Re-fetch the snapshot's metadata, replacing any cached copy, and notify
   * subscribers so the UI can re-render in place.
   */
  async refresh(snapshotId: string): Promise<SnapshotData> {
    await this.cache.delete(snapshotId);
    const fresh = await this.getSnapshot(snapshotId);
    await this.storeSnapshotData(snapshotId, fresh);
    this.emitRefresh(snapshotId);
    return fresh;
  }

  /** Subscribe to refresh events. Returns the unsubscribe function. */
  onSnapshotRefreshed(fn: RefreshListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emitRefresh(snapshotId: string): void {
    this.listeners.forEach((fn) => {
      try {
        fn(snapshotId);
      } catch (err) {
        console.error('snapshot refresh listener threw:', err);
      }
    });
  }

  /**
   * Persist snapshot data to the local cache and mark it as the current
   * snapshot for this tab. Existing pin state is preserved.
   */
  async storeSnapshotData(snapshotId: string, data: SnapshotData): Promise<void> {
    try {
      const now = Date.now();
      const existing = this.cache.peekSync(snapshotId);
      const entry: SnapshotCacheEntry = {
        snapshotId,
        metadata: data.metadata,
        metrics: existing?.metrics,
        tabOverrides: existing?.tabOverrides,
        cachedAt: existing?.cachedAt ?? now,
        lastAccessedAt: now,
        pinned: existing?.pinned ?? false,
        sizeBytes: 0,
      };
      await this.cache.put(entry);
      try {
        sessionStorage.setItem(CURRENT_ID_KEY, snapshotId);
      } catch {
        // Non-fatal.
      }
    } catch (error) {
      console.error('Error storing snapshot data:', error);
    }
  }

  /**
   * Synchronous read of the cached snapshot for the given id. Returns null
   * if the snapshot is not cached. As a side effect, the entry's
   * `lastAccessedAt` is bumped (fire-and-forget) for LRU tracking.
   */
  getStoredSnapshotData(snapshotId: string): SnapshotData | null {
    try {
      const entry = this.cache.peekSync(snapshotId);
      if (!entry) {
        return null;
      }
      void this.cache.touch(snapshotId);
      return {
        metadata: entry.metadata,
        data: {},
      };
    } catch (error) {
      console.error('Error retrieving stored snapshot data:', error);
      return null;
    }
  }

  /**
   * Synchronously read the persisted tab-visibility overrides for a snapshot.
   * Returns an empty map when the cache entry is missing.
   */
  getTabOverrides(snapshotId: string): Record<string, boolean> {
    const entry = this.cache.peekSync(snapshotId);
    return entry?.tabOverrides ?? {};
  }

  /**
   * Persist tab-visibility overrides for a snapshot. Writes back the
   * existing cache entry with the new map; no-op when the snapshot
   * isn't cached yet (shouldn't happen — the viewer always stores
   * before the dropdown can fire).
   */
  async setTabOverrides(snapshotId: string, overrides: Record<string, boolean>): Promise<void> {
    const existing = this.cache.peekSync(snapshotId);
    if (!existing) {
      return;
    }
    const now = Date.now();
    const entry: SnapshotCacheEntry = {
      ...existing,
      tabOverrides: overrides,
      lastAccessedAt: now,
      sizeBytes: 0,
    };
    await this.cache.put(entry);
  }

  /**
   * Get the current active snapshot ID
   */
  getCurrentSnapshotId(): string | null {
    try {
      return sessionStorage.getItem(CURRENT_ID_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Clear stored snapshot data. With no argument clears every cached
   * snapshot; otherwise clears the single entry.
   */
  async clearSnapshotData(snapshotId?: string): Promise<void> {
    try {
      if (snapshotId) {
        await this.cache.delete(snapshotId);
      } else {
        await this.cache.clearAll();
        try {
          sessionStorage.removeItem(CURRENT_ID_KEY);
        } catch {
          // ignore
        }
      }
    } catch (error) {
      console.error('Error clearing snapshot data:', error);
    }
  }
}

// Export a singleton instance
export const snapshotService = new SnapshotService();
export default snapshotService;
