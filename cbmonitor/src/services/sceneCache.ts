import { EmbeddedScene, SceneAppPage } from '@grafana/scenes';

/**
 * Cache key for scene and tab storage
 */
export interface CacheKey {
    snapshotId: string;
    serviceKey?: string;
    dashboardType?: string;
    additional?: string;
}

/**
 * Service for managing scene and tab caching across the application.
 * Provides unified cache management with different strategies for different use cases.
 */
class SceneCacheService {
    private sceneCache = new Map<string, EmbeddedScene>();
    private tabsCache = new Map<string, SceneAppPage[]>();

    /**
     * Generate a cache key from components
     */
    private makeKey(key: CacheKey): string {
        const parts = [key.snapshotId];
        if (key.serviceKey) { parts.push(key.serviceKey); }
        if (key.dashboardType) { parts.push(key.dashboardType); }
        if (key.additional) { parts.push(key.additional); }
        return parts.join(':');
    }

    /**
     * Get a cached scene
     */
    getScene(key: CacheKey): EmbeddedScene | undefined {
        return this.sceneCache.get(this.makeKey(key));
    }

    /**
     * Store a scene in cache
     */
    setScene(key: CacheKey, scene: EmbeddedScene): void {
        this.sceneCache.set(this.makeKey(key), scene);
    }

    /**
     * Check if a scene exists in cache
     */
    hasScene(key: CacheKey): boolean {
        return this.sceneCache.has(this.makeKey(key));
    }

    /**
     * Get cached tabs for a snapshot
     */
    getTabs(snapshotId: string): SceneAppPage[] | undefined {
        return this.tabsCache.get(`${snapshotId}_tabs`);
    }

    /**
     * Store tabs in cache
     */
    setTabs(snapshotId: string, tabs: SceneAppPage[]): void {
        this.tabsCache.set(`${snapshotId}_tabs`, tabs);
    }

    /**
     * Check if tabs exist in cache
     */
    hasTabs(snapshotId: string): boolean {
        return this.tabsCache.has(`${snapshotId}_tabs`);
    }

    /**
     * Clear all cache entries related to a specific snapshot
     */
    clearForSnapshot(snapshotId: string): void {
        // Clear scenes with this snapshot ID
        const keysToDelete: string[] = [];
        for (const key of this.sceneCache.keys()) {
            if (key.startsWith(`${snapshotId}:`)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.sceneCache.delete(key));

        // Clear tabs
        this.tabsCache.delete(`${snapshotId}_tabs`);
    }

    /**
     * Clear all scenes (but preserve tabs unless force is true)
     */
    clearScenes(force = false): void {
        this.sceneCache.clear();
        if (force) {
            this.tabsCache.clear();
        }
    }

    /**
     * Clear all caches
     */
    clearAll(): void {
        this.sceneCache.clear();
        this.tabsCache.clear();
    }

    /**
     * Get cache statistics for debugging/monitoring
     */
    getStats() {
        return {
            sceneCount: this.sceneCache.size,
            tabsCount: this.tabsCache.size,
            totalSize: this.sceneCache.size + this.tabsCache.size
        };
    }

    /**
     * Get all cached snapshot IDs
     */
    getCachedSnapshotIds(): string[] {
        const ids = new Set<string>();

        // Extract from scene keys
        for (const key of this.sceneCache.keys()) {
            const snapshotId = key.split(':')[0];
            if (snapshotId) { ids.add(snapshotId); }
        }

        // Extract from tab keys
        for (const key of this.tabsCache.keys()) {
            const snapshotId = key.replace('_tabs', '');
            if (snapshotId) { ids.add(snapshotId); }
        }

        return Array.from(ids);
    }
}

/**
 * Singleton instance of the scene cache service
 */
export const sceneCacheService = new SceneCacheService();
