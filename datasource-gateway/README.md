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
```

`/healthz` returns `200 {"status":"ok"}` once it's up.

## Configuration

Defaults live in [`configs/datasource-gateway/config.yaml`](../configs/datasource-gateway/config.yaml)
and can be overridden with `section.field=value` arguments (the container passes
them from `DSG_*` environment variables):

```sh
./bin/datasource-gateway --config config.yaml server.port=8090 logging.level=debug
```

| Setting | Default | Notes |
|---|---|---|
| `server.port` | `8090` | Deliberately off the Prometheus (9090) / Mimir (9009) defaults so it can share a host. |
| `server.host` | `0.0.0.0` | |
| `logging.level` | `info` | `debug` / `info` / `warn` / `error` |
| `prometheus.url` | `http://localhost:9009/prometheus` | Upstream Prometheus-compatible store for the passthrough path. |
| `couchbase.*` | — | Connection + metadata/metrics buckets for routing and the SQL++ path. |
