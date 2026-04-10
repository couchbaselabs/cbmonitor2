import { SceneQueryRunner } from '@grafana/scenes';

type OverlapQueryCacheEntry = {
    runner: SceneQueryRunner;
    createdAt: number;
    lastAccessedAt: number;
};

type OverlapQueryCacheOptions = {
    keyParts: Array<string | number | undefined>;
    createRunner: () => SceneQueryRunner;
    rerunOnHit?: boolean;
};

const DEFAULT_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 300;

class OverlapQueryCacheService {
    private cache = new Map<string, OverlapQueryCacheEntry>();

    private buildKey(keyParts: Array<string | number | undefined>): string {
        return keyParts.map((part) => String(part ?? '')).join('::');
    }

    private pruneExpired(now: number): void {
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.lastAccessedAt > DEFAULT_TTL_MS) {
                this.cache.delete(key);
            }
        }
    }

    private pruneOverflow(): void {
        if (this.cache.size <= MAX_ENTRIES) {
            return;
        }

        const entries = Array.from(this.cache.entries())
            .sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt);

        const overflowCount = this.cache.size - MAX_ENTRIES;
        for (let index = 0; index < overflowCount; index++) {
            const key = entries[index]?.[0];
            if (key) {
                this.cache.delete(key);
            }
        }
    }

    getOrCreateRunner(options: OverlapQueryCacheOptions): SceneQueryRunner {
        const now = Date.now();
        this.pruneExpired(now);

        const key = this.buildKey(options.keyParts);
        const cached = this.cache.get(key);
        if (cached) {
            cached.lastAccessedAt = now;
            if (options.rerunOnHit) {
                (cached.runner as any).run?.();
            }
            return cached.runner;
        }

        const runner = options.createRunner();
        this.cache.set(key, {
            runner,
            createdAt: now,
            lastAccessedAt: now,
        });

        this.pruneOverflow();
        return runner;
    }

    clear(): void {
        this.cache.clear();
    }

    getStats() {
        return {
            size: this.cache.size,
            ttlMs: DEFAULT_TTL_MS,
            maxEntries: MAX_ENTRIES,
        };
    }
}

export const overlapQueryCacheService = new OverlapQueryCacheService();