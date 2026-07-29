# datasource-gateway

A standalone, Prometheus-compatible query gateway for cbmonitor2. It is the
single datasource the Grafana frontend talks to for panel time-series: the
frontend always speaks PromQL, and the gateway hides where the data actually
lives.

Per query it routes by snapshot:

- **Prometheus-backed snapshots** — pass the PromQL straight through to the
  upstream Prometheus/Mimir (zero-copy streaming).
- **Couchbase-backed snapshots** — translate the PromQL to SQL++ and execute it
  against Couchbase (rate/irate/increase computed in Go; no Couchbase UDFs).
- **Overlap comparison** (`job=~"a|b"`) — fetch each snapshot over its own
  window and shift timestamps to a shared `t=0` axis so they can be overlaid.

Because the interface is a strict superset of the Prometheus HTTP API, a
deployment that doesn't need Couchbase or overlap can simply point its Grafana
Prometheus datasource straight at Prometheus and skip the gateway entirely.

## API surface

| Endpoint | Behavior |
|---|---|
| `/api/v1/query_range` | Routed per snapshot: window rewritten to the snapshot's stored range; Couchbase-backed snapshots evaluated via SQL++; multi-snapshot matchers fan out and merge on the `t=0` axis. |
| `/api/v1/query` | Same routing. Couchbase-backed snapshots evaluate at the snapshot's end; multi-snapshot matchers fan out over each full window without the time shift (instance discovery reads labels, not timestamps). |
| `/api/v1/labels`, `/api/v1/series`, `/api/v1/label/{name}/values` | Passthrough, with `start`/`end` rewritten to the snapshot window when the `match[]` selectors identify a single snapshot. |
| everything else under `/api/v1/` | Streaming passthrough to the upstream. |

Known limitation: label/series endpoints are not served from Couchbase. For a
Couchbase-backed snapshot they return whatever the upstream holds (typically
nothing). This only affects Grafana Explore's metric browser against
Couchbase-backed snapshots; panel queries are unaffected.

## Origin

This service originates from the **[SyncedApp](https://github.com/m-tarhon/SyncedApp)**
repo — the original `proxyprometheus` reverse proxy that time-pads snapshots for
overlap comparison. `datasource-gateway` generalises that proxy into the unified
gateway described above.

## Why a separate sidecar

The gateway has no dependency on the Grafana plugin backend and keeps running across Grafana restarts.

## Build & run

```sh
# Binary (from the repo root)
make build-gateway
./bin/datasource-gateway --config configs/datasource-gateway/config.yaml

# Docker (standalone compose project)
docker compose -f deployments/docker/compose.datasource-gateway.yml up --build -d

# Or as part of the main stack (runs config-manager + datasource-gateway)
docker compose -f deployments/docker/compose.yml up --build -d
```

`/healthz` returns `200 {"status":"ok"}` once it's up.

## Configuration

Defaults live in [`configs/datasource-gateway/config.yaml`](../configs/datasource-gateway/config.yaml)
and can be overridden with `section.field=value` arguments (the container passes
them from `DSG_*` environment variables):

```sh
./bin/datasource-gateway --config config.yaml server.port=8090 logging.level=debug
```

| Setting | Env var (Docker) | Default | Notes |
|---|---|---|---|
| `server.port` | `DSG_SERVER_PORT` | `8090` | Deliberately off the Prometheus (9090) / Mimir (9009) defaults so it can share a host. |
| `server.host` | — | `0.0.0.0` | |
| `logging.level` | `DSG_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `prometheus.url` | `DSG_PROMETHEUS_URL` | `http://localhost:9009/prometheus` | Upstream Prometheus-compatible store for the passthrough path. |
| `couchbase.enabled` | `DSG_COUCHBASE_ENABLED` | `true` | `false` serves the Prometheus path only. |
| `couchbase.host` | `DSG_COUCHBASE_HOST` | `localhost` | |
| `couchbase.username` | `DSG_COUCHBASE_USERNAME` | `Administrator` | |
| `couchbase.password` | `DSG_COUCHBASE_PASSWORD` | `password` | |
| `couchbase.metadata_bucket` | `DSG_COUCHBASE_METADATA_BUCKET` | `metadata` | Snapshot metadata for routing and time windows. |
| `couchbase.metadata_scope` | `DSG_COUCHBASE_METADATA_SCOPE` | `_default` | |
| `couchbase.metadata_collection` | `DSG_COUCHBASE_METADATA_COLLECTION` | `_default` | |
| `couchbase.metrics_bucket` | `DSG_COUCHBASE_METRICS_BUCKET` | `cbmonitor` | Metrics keyspace for the SQL++ path. |
| `couchbase.metrics_scope` | `DSG_COUCHBASE_METRICS_SCOPE` | `_default` | |
| `couchbase.metrics_collection` | `DSG_COUCHBASE_METRICS_COLLECTION` | `_default` | |

For example:

```sh
DSG_PROMETHEUS_URL=https://localhost/prometheus \
DSG_COUCHBASE_ENABLED=false \
docker compose -f deployments/docker/compose.datasource-gateway.yml up --build -d
```
