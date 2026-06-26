# Scene Builder Pipeline

This document describes how the cbmonitor frontend constructs Grafana Scenes-based dashboard pages for a given snapshot. Understanding this pipeline is necessary when adding services, changing how tabs are filtered, or debugging why a tab appears or disappears.

## Overview

When a user opens a snapshot or a comparison view, the app needs to produce a list of `SceneAppPage` instances — one per visible tab. The pipeline that does this spans three layers:

```
snapshot metadata
       │
       ▼
  tabVisibility.ts  ← determines which tabs exist and their defaults
       │
       ▼
  pageBuilder.ts    ← converts tab specs into SceneAppPage objects with scenes
       │
       ▼
  sceneCache.ts     ← memoizes expensive scene construction
```

The entry point is `buildServiceTabs()` in `src/services/pageBuilder.ts`, called from the snapshot view page (`src/pages/snapshotViewPage.ts`) and the comparison page (`src/pages/comparePage.ts`).

## Key Files

| File | Role |
|------|------|
| `src/services/tabVisibility.ts` | Pure tab-availability logic (no scene runtime, fully unit-testable) |
| `src/services/pageBuilder.ts` | Builds `SceneAppPage` instances; consumes and re-exports `tabVisibility` symbols |
| `src/services/sceneCache.ts` | `SceneCacheService` — memoises `EmbeddedScene` and `SceneAppPage[]` instances |
| `src/config/services.ts` | `SERVICE_CONFIGS` — service keys, titles, URL segments, builders, instance metrics |
| `src/config/products.ts` | `PRODUCT_CONFIGS` — product-to-tab ownership and default visibility rules |
| `src/utils/instanceScene.ts` | `createInstanceAwareScene` / `createInstanceAwareOverlapScene` — scene factory wrappers used by each service builder |

## Single-Mode Pipeline

```
buildServiceTabs({ mode: 'single', snapshotIds: [id], services, products, tabOverrides, customPanels })
  │
  ├─ getAvailableTabs(services, customPanels, products)
  │     ├─ getOwnedTabs(products)   → builtin tabs owned by present products, with default visibility
  │     └─ customPanels entries     → custom tabs, always defaultVisible=true
  │
  ├─ getTabsToRender(available, tabOverrides)
  │     └─ if nothing visible → fall back to a single 'Overview' tab
  │
  └─ per tab:
        'builtin'  → buildSingleSnapshotPage(serviceKey, snapshotId, ...)
        'custom'   → buildCustomPanelsPage(snapshotId, ..., customPanels)
        'overview' → buildOverviewPage(snapshotId, ...)
```

### Scene caching (single mode)

`buildSingleSnapshotPage` uses `sceneCacheService` with a key composed of:

```
snapshotId : serviceKey : dashboardType : cluster:X_instance:Y_hideEmpty:Z
```

The cluster, instance, and hideEmpty components are captured at build time from the filter services (`clusterFilterService`, `instanceFilterService`, `layoutService`). Changing any of these filters must invalidate the cache (typically by calling `sceneCacheService.clearScenes()`).

### Custom tabs

Each `custom_panels` entry in snapshot metadata becomes one tab if and only if the pre-discovery step (`getCachedCustomMetricNames`) returns at least one matching metric name. `buildCustomPanelsPage` returns `null` when the discovery result is empty, and `buildServiceTabs` silently skips it. The segment is slugified from the entry's `title` (e.g. `"My Service"` → `custom-my-service`), deduplicated with a numeric suffix on collision.

### Phase regions layer

After constructing a scene, `buildSingleSnapshotPage` attaches a `SnapshotPhaseRegionsLayer` to the scene's `$data` slot if none is already present. This is the mechanism by which phase annotation bands appear on every panel in the view.

## Comparison-Mode Pipeline

```
buildServiceTabs({ mode: 'comparison', snapshotIds: [...], services, products, timeRanges, overlapMode })
  │
  └─ getOwnedTabs(products)
        │  (no getAvailableTabs — comparison uses product-owned set, not full user-toggleable set)
        └─ per owned tab: owned.visibility === 'always' OR service in detected-common set
              → buildComparisonPage(serviceKey, snapshotIds, ...)
```

There is no tab-override mechanism in comparison mode. The `SettingsDropdown` is not mounted on compare pages.

### Overlap vs side-by-side

Inside `buildComparisonPage`, the `overlapMode` flag selects between two paths:

- **Overlap**: calls `createInstanceAwareOverlapScene(snapshotIds.join('|'), builder, { overlapEndTimeSeconds })`. The joined snapshot ID string is the key the overlap scene uses to fan out its queries.
- **Side-by-side**: builds one `SceneFlexItem` per snapshot ID, each backed by `createInstanceAwareScene`. Scene instances are memoised by `sceneCacheService` with a `comparison-left` / `comparison-right` type suffix.

## Tab Visibility Rules

Tab visibility is computed in `getAvailableTabs()` and overridden by the user via `tabOverrides` (a `Record<string, boolean>` persisted in the URL or snapshot state).

1. A builtin tab's `defaultVisible` = `owned.visibility === 'always'` OR the service key is in the detected-services set.
2. Custom tabs are always `defaultVisible = true`.
3. `getTabsToRender` applies user overrides on top of defaults. The result must have at least one visible tab; if all are hidden the Overview tab is injected.

`OVERVIEW_TAB_KEY` and `OVERVIEW_TAB_SEGMENT` are both `'overview'`. The Overview tab is intentionally absent from `getAvailableTabs` so it never appears as a checkbox row in the `SettingsDropdown`.

## Product and Service Registration

To add a new service tab, you need changes in at least two places:

1. **`src/config/services.ts`** — add a `ServiceConfig` with `key`, `title`, `segment`, `aliases`, `builder`, `instanceMetric`.
2. **`src/config/products.ts`** — add the service to the owning product's `tabs` array with a `visibility` of `'always'` or `'whenDetected'`.

Without both, the tab will either never appear (missing product registration) or appear without correct detection logic. See [adding-dashboard-tabs.md](adding-dashboard-tabs.md) for a full step-by-step guide.

## Troubleshooting

**Tab doesn't appear at all**
- Check `getOwnedTabs(products)` includes the service for the products the snapshot reports. The snapshot's `metadata.products` array drives `resolveProducts()`.
- Check the service key from `normaliseServiceName` matches what `SERVICE_CONFIGS` registers.

**Tab appears but shows empty panels**
- The scene builder (`config.builder`) ran but found no data. Check Couchbase or Prometheus for the expected metrics. Instance filtering may be selecting an instance ID that has no data.

**Tab appears but the wrong scene is shown (stale content)**
- The scene cache was hit with a stale key. Force a cache invalidation by clearing filters or reloading the page. During development, call `sceneCacheService.clearAll()` from the browser console.
