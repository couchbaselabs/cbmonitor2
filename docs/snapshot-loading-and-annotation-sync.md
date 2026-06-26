# Snapshot Loading and Phase Annotation Sync

This document covers how snapshot metadata is loaded into the frontend, how the fallback path works when the backend is unavailable, and how snapshot phases are mirrored into Grafana's annotation store.

## Key Files

| File | Role |
|------|------|
| `src/services/snapshotLoader.ts` | Public API for loading one or many snapshots; holds fallback and annotation-sync logic |
| `src/services/snapshotService.ts` | HTTP client + IndexedDB cache for snapshot data; singleton `snapshotService` |
| `src/types/snapshot.ts` | `SnapshotData`, `SnapshotMetadata`, `Phase` type definitions |

## Load Flow

```
loadSnapshot(snapshotId)
  │
  ├─ snapshotService.getStoredSnapshotData(snapshotId)
  │     └─ cache hit → return immediately (no network call)
  │
  └─ cache miss
        ├─ snapshotService.getSnapshot(snapshotId)   ← GET /snapshots/{id}
        │     ├─ success
        │     │     ├─ snapshotService.storeSnapshotData(snapshotId, snapshot)
        │     │     └─ snapshotService.syncPhaseAnnotations(snapshotId)  ← see below
        │     │
        │     └─ failure
        │           ├─ HTTP 404 / "not found" → re-throw (do not fall back)
        │           └─ any other error → build and return a fallback snapshot (see below)
        │
        └─ return { id, snapshot, metadata }
```

`loadSnapshots(ids)` is a thin parallel wrapper over `loadSnapshot`.

## Fallback Snapshot

When the backend returns any non-404 error (the snapshots feature is disabled, a transient network failure, service not yet ready), `snapshotLoader` synthesises a minimal `SnapshotData`:

```ts
{
  metadata: {
    snapshotId,
    services: [],
    version: '',
    ts_start: <15 minutes ago>,
    ts_end: <now>,
    phases: [],
  },
  data: {},
}
```

The fallback is **not persisted** to the cache, so the next navigation to the same snapshot will retry the backend fetch. Its sole purpose is to give panels a non-empty time window so they can attempt queries — the backend honours the same convention by returning data for any recent time range when the snapshots feature is disabled.

A 404 is explicitly not caught because it means the snapshot ID itself is invalid; the caller (typically the snapshot view page) is expected to render an error state rather than an empty dashboard.

## Phase Annotation Sync

After a successful first load, `snapshotService.syncPhaseAnnotations(snapshotId)` is called. This pushes each `Phase` from `metadata.phases` into Grafana's organisation-scoped annotation store using the Grafana HTTP API through the plugin proxy.

**Why this exists**: native Grafana dashboards (the bundled product dashboards reconciled by the backend) cannot access plugin state directly. Phases are stored as annotations so those dashboards can use the built-in "Annotations" data source to show phase bands without plugin-specific data sources.

**What it writes**: one annotation per phase, tagged with the snapshot ID. Annotations are upserted, not duplicated — a re-navigation to the same snapshot does not create duplicate annotations because `syncPhaseAnnotations` is only called when the snapshot is written to cache (i.e., on first load, not on cache hits).

**Permissions required**: the plugin's IAM block in `plugin.json` must include `annotations:create` and `annotations:delete` with `scope: annotations:type:organization`. Removing these will silently break phase display on native dashboards.

## Common Scenarios for Maintainers

### Snapshot loads but phases don't appear on native dashboards

Check:
1. The backend returned `phases` in the snapshot metadata (non-empty array in `metadata.phases`).
2. `syncPhaseAnnotations` completed successfully (browser console, no errors under "cbmonitor").
3. The native dashboard has an annotation query targeting the `cbmonitor` tag and the relevant snapshot ID.
4. The IAM permissions in `plugin.json` include `annotations:create` at org scope.

### Page shows panels with "15 minutes" range instead of snapshot range

The fallback path was taken. Check the browser console for a "Snapshot metadata unavailable" warning. The backend may have the snapshots feature disabled (`Snapshots.Enabled = false` in plugin config), or the snapshot ID may be valid but the backend returned a transient error.

### Re-loading stale data after a snapshot is updated on the backend

The cache does not have an automatic TTL. Call `snapshotService.clearSnapshotData(snapshotId)` (or `clearSnapshotData()` for all) to force a re-fetch. The `clearSnapshotData` method also removes the snapshot ID from `sessionStorage`.

## Exported Helper Functions from snapshotLoader.ts

| Function | Description |
|----------|-------------|
| `loadSnapshot(id)` | Load one snapshot with caching and fallback |
| `loadSnapshots(ids[])` | Parallel load of multiple snapshots |
| `findCommonServicesInSnapshots(snapshots)` | Intersection of services across snapshots, in canonical order |
| `findCommonProductsInSnapshots(snapshots)` | Intersection of products across snapshots, in registry order |
| `findCommonPhasesInSnapshots(snapshots)` | Intersection of phase labels across snapshots (case-insensitive), ordered by first snapshot |
| `getMaxSnapshotDuration(metadatas[])` | Largest (end − start) duration across a set of metadata objects |
| `formatSnapshotInfo(snapshots)` | Debug-oriented multi-line string of snapshot summaries |
