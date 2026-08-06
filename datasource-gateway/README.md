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

## Snapshot routing

A snapshot's metadata document decides how its queries are served:

| Field | Meaning |
|---|---|
| `ts_start` | Start of the snapshot's window. Required for any snapshot-aware behaviour. |
| `ts_end` | End of the window. The sentinel `"now"` (or an absent value) marks a still-running snapshot, whose window ends at the current time and is re-resolved rather than cached. |
| `store` | `"couchbase"` routes the snapshot's queries through the SQL++ path; anything else, including an absent field, serves it from the upstream Prometheus. |

**The Couchbase path is currently dormant.** Nothing in this repo writes
`store`, so every snapshot is served from Prometheus/Mimir today. The
translation layer (`internal/cbeval`, `internal/querybuilder`) is maintained and
tested but unexercised in production; enabling it means writing
`store: "couchbase"` when a snapshot's samples are archived to Couchbase.

A request's own time range is honoured wherever it overlaps the snapshot, so a
phase selection or a drag-zoom keeps the resolution the client asked for. Only a
range that misses the snapshot entirely — a stale or dashboard-global time
picker — is replaced by the full window.

## API surface

| Endpoint | Behavior |
|---|---|
| `/api/v1/query_range` | Routed per snapshot: the request's range is confined to the snapshot's window; Couchbase-backed snapshots evaluated via SQL++; multi-snapshot matchers fan out and merge on the `t=0` axis. |
| `/api/v1/query` | Same routing. The evaluation instant is kept when it falls inside the snapshot, else clamped to the snapshot's end; multi-snapshot matchers fan out over each full window without the time shift (instance discovery reads labels, not timestamps). |
| `/api/v1/labels`, `/api/v1/series`, `/api/v1/label/{name}/values` | Passthrough, with `start`/`end` rewritten to the snapshot window when the `match[]` selectors identify a single snapshot. |
| everything else under `/api/v1/` | Streaming passthrough to the upstream. |

A snapshot that can't contribute to an overlap comparison (no parseable window,
or a failing upstream) drops out of the result rather than failing the whole
query, and the reason is reported in the response's `warnings` so the panel
shows it.

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

Settings are layered, each level overriding the one before it: built-in
defaults, then the config file, then `DSG_*` environment variables, then
`section.field=value` command-line arguments.

Defaults live in [`configs/datasource-gateway/config.yaml`](../configs/datasource-gateway/config.yaml).

```sh
# Environment (how the container is configured — secrets stay out of argv)
DSG_PROMETHEUS_URL=http://mimir:9009/prometheus ./bin/datasource-gateway --config config.yaml

# Command line, for ad-hoc overrides
./bin/datasource-gateway --config config.yaml server.port=8090 logging.level=debug
```

Prefer the environment for `couchbase.password`: an argument would be visible to
anyone who can run `ps` or `docker inspect`.

| Setting | Env var | Default | Notes |
|---|---|---|---|
| `server.port` | `DSG_SERVER_PORT` | `8090` | Deliberately off the Prometheus (9090) / Mimir (9009) defaults so it can share a host. |
| `server.host` | `DSG_SERVER_HOST` | `0.0.0.0` | |
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
