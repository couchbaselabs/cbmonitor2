# Query Cache Lifecycle

This document describes the two distinct caches the cbmonitor frontend uses to avoid redundant work across navigations and the overlap comparison view.

## Two Separate Caches

| Cache | File | What it holds | Scope |
|-------|------|--------------|-------|
| `SceneCacheService` | `src/services/sceneCache.ts` | `EmbeddedScene` and `SceneAppPage[]` instances | Process lifetime (unbounded, manual invalidation) |
| `OverlapQueryCacheService` | `src/services/overlapQueryCache.ts` | `SceneQueryRunner` instances for the overlap view | 60 s TTL, max 300 entries, LRU eviction |

---

## SceneCacheService

### Purpose

Building a `SceneAppPage` / `EmbeddedScene` is expensive: it involves constructing query runners, panel objects, and layout trees. Without caching, switching tabs or re-navigating to the same snapshot would rebuild all panels from scratch and re-fire every backend query.

### Cache key structure

The key is a colon-joined string:

```
{snapshotId}:{serviceKey}:{dashboardType}:{additional}
```

The `additional` segment encodes the current filter state at the time of construction:

```
cluster:{value}_instance:{value}_hideEmpty:{true|false}
```

This means a scene is considered stale any time the user changes the cluster filter, the instance filter, or the hide-empty-panels toggle. When those values change, the calling code must clear the cache (via `clearScenes()` or `clearForSnapshot(id)`) so the next `getScene()` call returns a miss and triggers a rebuild.

### Invalidation

There is no automatic TTL. The cache lives until:

- `clearScenes()` — clears all scenes, optionally also tabs if `force = true`.
- `clearForSnapshot(snapshotId)` — clears scenes and the tab entry for one snapshot.
- `clearAll()` — clears both scenes and tabs completely.
- The page is reloaded (process ends).

`snapshotService.clearSnapshotData()` does **not** clear the scene cache. If you need to force a full data + scene refresh, call both.

### Tab cache

`SceneCacheService` also caches `SceneAppPage[]` arrays via `setTabs` / `getTabs` / `hasTabs`. Tab arrays are keyed by `{snapshotId}_tabs`. The tab cache allows the snapshot view page to skip re-running `buildServiceTabs` on repeat visits to the same snapshot with unchanged settings.

---

## OverlapQueryCacheService

### Purpose

In the overlap comparison view, multiple `SceneQueryRunner` instances are created — one per (snapshot pair × metric × instance). Without caching, each render cycle would construct new runners and fire duplicate queries against the backend. The overlap cache prevents this by reusing runners for the lifetime of a session or until they expire.

### Eviction policy

- **TTL**: 60 seconds of inactivity. A runner is evicted when it has not been accessed for 60 seconds (checked lazily on each `getOrCreateRunner` call).
- **Max size**: 300 entries. When the limit is exceeded after a new entry is inserted, the least-recently-accessed entries are evicted first.
- Eviction is triggered at the start of each `getOrCreateRunner` call (expire pass first, then overflow pass after insertion).

### Rerun on hit

The `rerunOnHit` option on `getOrCreateRunner` causes the returned (cached) runner to call its internal `run()` method. Set this when you need to force a data refresh on a cache hit rather than just reusing the runner's last result. It is used when the time range changes in an overlap panel.

### Key construction

Keys are built by joining `keyParts` with `::`:

```ts
overlapQueryCacheService.getOrCreateRunner({
    keyParts: [snapshotId, metricName, instanceId, overlapEndTimeSeconds],
    createRunner: () => new SceneQueryRunner({ ... }),
});
```

Choose `keyParts` that uniquely identify the runner's query intent. Including `overlapEndTimeSeconds` ensures runners are not reused across time-range changes in the comparison view.

### Manual clearing

Call `overlapQueryCacheService.clear()` to flush all entries. The overlap page does this when the user changes the comparison snapshot set, ensuring no stale runners carry over from a previous comparison.

---

## Debugging

Both cache services expose a `getStats()` method that returns a lightweight count object. Call from the browser console:

```js
// SceneCacheService
import('/plugins/cbmonitor/src/services/sceneCache.js').then(m => console.log(m.sceneCacheService.getStats()));

// OverlapQueryCacheService — via a panel or page that imports it
```

The easier path during development is to set breakpoints in `setScene` / `getOrCreateRunner` to observe cache hits and misses.
