# Adding Dashboard Tabs

This document explains the two supported ways to add a dashboard tab in cbmonitor when you want a separate list of panels.

Use the metadata-driven method when you want a snapshot-specific custom tab without changing the plugin code. Use the built-in service method when you want a permanent first-class tab that is part of the product's normal dashboard set.

## Overview

cbmonitor supports two different tab-extension paths:

1. `custom_panels` in snapshot metadata
2. A new built-in service builder registered in the frontend

They are not interchangeable.

- `custom_panels` is the lighter-weight option. It lets a snapshot declare one or more extra tabs, each with its own discovered set of panels.
- A built-in service tab is the heavier-weight option. It requires code changes, but gives you a permanent, named service dashboard that behaves like the existing System, KV, Query, and other service tabs.

## Method 1: Snapshot-Declared `custom_panels`

Use this when you want to add one or more custom tabs for a specific snapshot or snapshot-producing pipeline.

### How it works

The snapshot metadata may include a `custom_panels` field. cbmonitor reads it from snapshot metadata, pre-discovers the matching metric names, and creates one tab per `custom_panels` entry if that entry resolves to at least one metric.

Relevant code:

- `pkg/models/snapshot.go`
- `pkg/services/snapshot.go`
- `pkg/handlers/snapshot.go`
- `src/types/snapshot.ts`
- `src/pages/snapshotViewPage.ts`
- `src/services/pageBuilder.ts`
- `src/dashboards/custom.ts`

### Supported config shape

Each `custom_panels` entry supports:

- `title`: optional tab title
- `match`: required regex used to find metric names
- `rate_match`: optional regex for metrics that should default to `rate(...)`
- `overrides`: optional per-metric display overrides

Example:

```json
{
  "custom_panels": [
    {
      "title": "My Service",
      "match": "^myservice_.*",
      "rate_match": "_total$",
      "overrides": {
        "myservice_requests_total": {
          "title": "Requests",
          "unit": "reqps",
          "transformFunction": "rate"
        },
        "myservice_latency_seconds": {
          "title": "Latency",
          "unit": "s"
        }
      }
    }
  ]
}
```

### What cbmonitor does with it

1. The snapshot backend reads `custom_panels` from raw snapshot metadata.
2. Entries without a non-empty `match` field are ignored.
3. When the snapshot page loads, the frontend calls `/snapshots/{id}/metric-names?match=...` for each entry.
4. If any metrics match, cbmonitor creates one tab for that `custom_panels` entry.
5. The tab renders one panel per discovered metric.

The actual panel expression is generated in `src/dashboards/custom.ts`.

### Behavior and limitations

- One `custom_panels` entry becomes one tab.
- One matched metric becomes one panel.
- Tabs are only shown when discovery returns at least one metric.
- Regex validation happens server-side.
- Metric discovery is capped to protect the UI from creating too many panels.
- These tabs are single-snapshot only. They are not rendered in comparison mode.
- The builder only emits base panels, not service-specific per-instance layouts.

### When to choose this method

Choose `custom_panels` when:

- the tab is snapshot-specific or pipeline-specific
- you do not want to modify frontend service registration
- panel selection can be driven by metric-name regex
- a generic one-panel-per-metric layout is acceptable

Do not choose it when you need custom panel layout logic, special grouping, or permanent product-level ownership.

## Method 2: Add a Built-In Service Tab

Use this when the new tab should behave like a normal cbmonitor service dashboard.

### How it works

Built-in tabs are frontend service builders registered in the service catalog. Product ownership and default visibility are configured separately.

Relevant code:

- `src/dashboards/*.ts`
- `src/config/services.ts`
- `src/config/products.ts`
- `src/services/pageBuilder.ts`
- `src/pages.ts`

### Required steps

#### 1. Create a dashboard builder

Add a new builder file under `src/dashboards/`, following the same pattern as the existing service builders such as:

- `src/dashboards/system.ts`
- `src/dashboards/kv.ts`
- `src/dashboards/query.ts`

The builder is responsible for returning the exact set of panels that belong on the tab.

#### 2. Register the service

Add the new builder to `src/config/services.ts` by creating a new `ServiceConfig` entry with:

- `key`
- `title`
- `segment`
- `aliases`
- `builder`
- `instanceMetric`
- optional `overlapInstanceMetric`

This is what makes the service known to the tab-building system.

#### 3. Register product ownership

If the tab should appear as part of a product's normal dashboard set, add it to `src/config/products.ts`.

That controls:

- which product owns the tab
- whether it is always shown or only shown when the service is detected
- the ordering of the tab among the other built-in tabs

If you skip this step, the builder may exist, but the product-owned tab flow will not surface it in the normal way.

#### 4. Ensure snapshot metadata exposes the service

The snapshot must still advertise the service through `metadata.services` when the tab should be treated as detected. Aliases are normalized through `src/config/services.ts`.

#### 5. Validate the change

From the `cbmonitor` directory, use the normal frontend build and validation commands:

```bash
npm install
npm run dev
npm run typecheck
npm run test:ci
npm run lint
```

If you changed backend Go code as well, build the backend with the standard Mage targets documented in `README.md`.

### When to choose this method

Choose a built-in service tab when:

- the tab is a permanent part of the product
- you need custom panel composition or layout logic
- you need a first-class service identity with a stable route segment
- you want the tab to participate in the normal product/tab ownership model
- you may need comparison-mode support

## Choosing Between the Two

Use `custom_panels` if you want a quick, metadata-driven tab with one panel per matched metric.

Use a built-in service tab if you want a permanent dashboard with fully custom behavior and explicit registration in the service and product catalogs.

## Practical Rule

If the question is, "Can I describe this tab with a metric-name regex and accept a generic one-panel-per-metric renderer?" then use `custom_panels`.

If the question is, "Do I need a real service dashboard with custom logic and a maintained place in the app's tab model?" then add a built-in service builder.