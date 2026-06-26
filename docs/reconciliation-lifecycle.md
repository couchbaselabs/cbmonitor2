# Reconciliation Lifecycle

This document explains how cbmonitor automatically creates, updates, and deletes Grafana datasources and bundled dashboards. Understanding this is essential when debugging configuration that "doesn't apply" after a settings change, or when the plugin fights with YAML-provisioned infrastructure.

## Why Reconciliation Exists

cbmonitor's plugin settings (Couchbase connection string, Prometheus URL, feature toggles) live in Grafana's plugin `jsonData` / `secureJsonData` store. Downstream Grafana resources — datasources and dashboards — must reflect those settings. Rather than asking the operator to configure them manually, the plugin manages them directly via the Grafana HTTP API using a service-account token the plugin framework provides automatically.

## Two Reconcilers

| Reconciler | File | What it manages |
|------------|------|-----------------|
| `Reconciler` | `pkg/plugin/datasources.go` | Prometheus and Couchbase datasources (UIDs `prometheus`, `cbdatasource`) |
| `DashboardReconciler` | `pkg/plugin/dashboards.go` | Bundled product dashboards (embedded in the plugin binary under `bundled-dashboards/`) |

Both reconcilers are never-abort: errors on individual resources are collected and logged, but a failure on one datasource or dashboard does not prevent the others from being processed.

## Datasource Reconciliation

### Managed UIDs

The reconciler owns exactly two UIDs: `prometheus` and `cbdatasource`. These constants are defined in `pkg/plugin/datasources.go` and must match the hardcoded values in the frontend (`src/constants.ts`). Do not change these UIDs without updating both files.

### Desired state

`PluginSettings.desiredDatasources()` computes the `[]DesiredDatasource` list from the current plugin settings. A UID is included only when its feature is enabled **and** the required configuration (URL, connection string) is non-empty.

### Reconcile phases

**Phase 1 — create/update**: for each desired datasource:
1. GET `/api/datasources/uid/{uid}` from Grafana.
2. If 404 → POST (create).
3. If present and `readOnly = true` → return an error (YAML-provisioned; see below).
4. If present and state differs → PUT (update). State comparison ignores secrets.
5. If present and state matches → skip.

**Phase 2 — delete orphans**: for each UID in `appManagedUIDs` that is absent from the `desired` list, DELETE it — unless the `claimed` set says the feature is enabled but config is missing. The `claimed` guard prevents a missing `$PROMETHEUS_URL` from silently destroying a working datasource.

### Conflict with YAML provisioning

If Grafana has a datasource with UID `prometheus` or `cbdatasource` provisioned via a YAML file (`provisioning/datasources/`), it will be marked `readOnly = true`. The reconciler refuses to overwrite read-only datasources and logs an error:

```
cbmonitor datasource reconcile failed uid=prometheus error="datasource prometheus is read-only (likely YAML-provisioned); remove it from provisioning/datasources/datasource.yaml so the cbmonitor app can manage it"
```

Resolution: remove the conflicting YAML entry and let the plugin manage the datasource.

## Dashboard Reconciliation

### Bundled dashboards

Dashboard JSON files are embedded at compile time from `pkg/plugin/bundled-dashboards/`. The directory structure is:

```
bundled-dashboards/
  <folder-title>/
    dashboard-name.json
    ...
```

The directory name becomes the Grafana folder title. Each JSON must have a top-level `"uid"` field (classic format) or `"metadata.name"` (v2 format, detected by `apiVersion: "dashboard.grafana.app/v2"`).

### Reconcile phases

1. **Ensure folders**: for each distinct folder title, create a Grafana folder if it doesn't exist. The folder UID is resolved from the API response and stored for the next phase.
2. **Upsert dashboards**: for each bundled dashboard, POST to `/api/dashboards/import` with `overwrite: true` and the resolved `folderUid`. If the folder from phase 1 failed, the dashboard is skipped (logged in `status.Skipped`).

A dashboard is never deleted by the reconciler. Removing a file from `bundled-dashboards/` stops it being updated but does not remove the existing Grafana copy.

## Trigger Points

Both reconcilers are triggered from two places:

### 1. Lazy first-request (automatic)

`App.CallResource` fires `reconcileNow` and `reconcileDashboardsNow` exactly once per `App` instance via a `sync.Once`. Grafana re-creates the `App` instance on every plugin settings save, so this effectively means "reconcile on first request after any settings change."

```
User saves plugin config → Grafana re-creates App → first CallResource call → reconcile fires in background goroutine
```

The reconcile runs in a detached goroutine so the triggering request is not blocked.

### 2. Explicit admin endpoints (on-demand)

Two admin HTTP endpoints force a synchronous reconcile and return the outcome:

| Endpoint | Method | What it runs |
|----------|--------|-------------|
| `POST /admin/reconcile-datasources` | `handleReconcileDatasources` | Full datasource reconcile pass |
| `POST /admin/reconcile-dashboards` | `handleReconcileDashboards` | Full dashboard reconcile pass |

The datasource endpoint also marks the `sync.Once` as already-fired (`a.reconcileOnce.Do(func() {})`) so the lazy path doesn't run a second pass after the explicit call.

The frontend calls `POST /admin/reconcile-datasources` after the AppConfig save form is submitted, so config changes take effect before the page reloads.

## Reconcile Status

Both reconcilers report their outcome via a status object that the frontend reads:

**Datasource status** — `ReconcileStatus`:

```go
{
  Status:         "ok" | "skipped" | "error" | "pending" | "disabled",
  LastError:      string,
  LastRunAt:      time.Time,
  AppManagedUIDs: []string,
}
```

Available at `GET /config/datasources` in the `reconciliation` field.

**Dashboard status** — `DashboardReconcileStatus`:

```go
{
  Status:     "ok" | "skipped" | "error" | "pending" | "disabled",
  LastError:  string,
  LastRunAt:  time.Time,
  Bundled:    []string,   // UIDs shipped in the binary
  Folders:    []string,   // folder titles managed
  Created:    []string,   // UIDs created this pass
  Updated:    []string,   // UIDs updated this pass
  Skipped:    []string,   // UIDs skipped (folder failed)
  FolderUIDs: map[string]string, // title -> uid
}
```

Available at `POST /admin/reconcile-dashboards` (response body) or stored in `App.dashboardReconcileState`.

**`"disabled"` status** means the plugin's service-account token or app URL was unavailable. This happens when the plugin runs under a Grafana version or configuration that does not expose the token via `PluginAppClientSecret()`. Check the plugin's IAM permissions block in `plugin.json` and the Grafana version (requires ≥ 11.6.0 per `plugin.json` `grafanaDependency`).

## Lifecycle Diagram

```
Grafana starts / plugin settings saved
          │
          ▼
     NewApp()
       ├─ LoadSettings()
       ├─ initServices()    ← open Couchbase connections
       └─ registerRoutes()  ← mount HTTP handlers including admin endpoints

First incoming request
          │
          ▼
     CallResource()
          └─ reconcileOnce.Do(...)
                ├─ go reconcileNow()           ← datasource reconciler
                └─ go reconcileDashboardsNow() ← dashboard reconciler

User saves AppConfig (frontend)
          │
          ▼
     POST /admin/reconcile-datasources  ← explicit sync reconcile
          └─ returns ReconcileStatus JSON

Grafana shuts down / settings change
          │
          ▼
     Dispose()
          ├─ reconcileCancel()  ← signal background goroutines to stop
          └─ close Couchbase connections
```

## Troubleshooting

**Datasource not created / not updated after saving settings**
1. Check `GET /config/datasources` → `reconciliation.status`. If `"disabled"`, the SA token is missing.
2. Check the Grafana server logs for `cbmonitor datasource reconcile failed`.
3. Call `POST /admin/reconcile-datasources` manually and inspect the response.

**Dashboard not updated after changing `bundled-dashboards/`**
- The lazy reconcile only runs once per App instance. If settings were not saved, the new binary was loaded but reconcile didn't run. Call `POST /admin/reconcile-dashboards` manually or save plugin settings to trigger a re-instantiation.

**Reconciler deletes a datasource that should stay**
- The `claimed` guard should prevent this when the feature is enabled but config is incomplete. If the feature toggle itself is off, deletion is intentional.
