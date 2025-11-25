# CBMonitor API Reference

This document describes the available API endpoints for querying Couchbase monitoring data. 

If you are using the Grafana plugin, you can access the API at `http://localhost:3000/api/plugins/cbmonitor/resources/`. For the used setup, all endpoints are accessible via `/api/v1/` prefix through the Nginx reverse proxy.

## Table of Contents

- [Snapshot API](#snapshot-api)
- [PromQL Query API](#promql-query-api)

---

## Snapshot API

The Snapshot API provides endpoints for accessing snapshot metadata and raw metric data for debugging purposes.

### GET /api/v1/snapshots/{id}

Get snapshot metadata including services, version, time ranges, and phases.

**Path Parameters:**
- `id` (required): Snapshot ID

**Example Request:**
```
GET /api/v1/snapshots/faa940df-70a5-46fa-aeee-2f02747a903d
```

<details>
<summary><strong>Example Response:</strong></summary>

```json
{
  "success": true,
  "data": {
    "metadata": {
      "snapshotId": "faa940df-70a5-46fa-aeee-2f02747a903d",
      "services": ["kv", "n1ql", "index"],
      "version": "7.2.0",
      "ts_start": "2025-11-18T15:00:00Z",
      "ts_end": "2025-11-18T16:00:00Z",
      "phases": [
        {
          "label": "access",
          "ts_start": "2025-11-18T15:00:00Z",
          "ts_end": "2025-11-18T15:30:00Z"
        }
      ]
    }
  }
}
```
</details>

### GET /api/v1/snapshots/{id}/metrics/{metric_name}

Get raw time-series data for a specific metric within a snapshot.

**Path Parameters:**
- `id` (required): Snapshot ID
- `metric_name` (required): Metric name (e.g., `kv_ops`, `sys_cpu_utilization_rate`)

**Example Request:**
```
GET /api/v1/snapshots/faa940df-70a5-46fa-aeee-2f02747a903d/metrics/kv_ops
```

<details>
<summary><strong>Example Response:</strong></summary>

```json
{
  "success": true,
  "metric": "kv_ops",
  "snapshot": "faa940df-70a5-46fa-aeee-2f02747a903d",
  "values": [
    {
      "time": "2025-11-18T15:00:20Z",
      "value": 1250.5
    },
    {
      "time": "2025-11-18T15:00:21Z",
      "value": 1280.3
    }
  ],
  "count": 3600
}
```
</details>

### GET /api/v1/snapshots/{id}/metrics/{metric_name}/summary

Get pre-computed summary statistics for a metric across the entire snapshot.

**Path Parameters:**
- `id` (required): Snapshot ID
- `metric_name` (required): Metric name

**Example Request:**
```
GET /api/v1/snapshots/faa940df-70a5-46fa-aeee-2f02747a903d/metrics/kv_ops/summary
```

<details>
<summary><strong>Example Response:</strong></summary>

```json
{
  "success": true,
  "metric": "kv_ops",
  "snapshot": "faa940df-70a5-46fa-aeee-2f02747a903d",
  "summary": {
    "count": 3600,
    "avg": 1250.5,
    "min": 800.2,
    "max": 2000.8,
    "p50": 1240.3,
    "p80": 1500.7,
    "p95": 1800.2,
    "p99": 1950.5
  }
}
```
</details>

### GET /api/v1/snapshots/{id}/metrics/{metric_name}/phases/{phase_name}

Get raw time-series data for a specific metric within a specific phase of a snapshot.

**Path Parameters:**
- `id` (required): Snapshot ID
- `metric_name` (required): Metric name
- `phase_name` (required): Phase name (e.g., `access`, `warmup`)

**Example Request:**
```
GET /api/v1/snapshots/faa940df-70a5-46fa-aeee-2f02747a903d/metrics/kv_ops/phases/access
```

<details>
<summary><strong>Example Response:</strong></summary>

```json
{
  "success": true,
  "metric": "kv_ops",
  "snapshot": "faa940df-70a5-46fa-aeee-2f02747a903d",
  "values": [
    {
      "time": "2025-11-18T15:00:20Z",
      "value": 1250.5
    },
    {
      "time": "2025-11-18T15:00:21Z",
      "value": 1280.3
    }
  ],
  "count": 1800
}
```
</details>

### GET /api/v1/snapshots/{id}/metrics/{metric_name}/phases/{phase_name}/summary

Get pre-computed summary statistics for a metric within a specific phase.

**Path Parameters:**
- `id` (required): Snapshot ID
- `metric_name` (required): Metric name
- `phase_name` (required): Phase name

**Example Request:**
```
GET /api/v1/snapshots/faa940df-70a5-46fa-aeee-2f02747a903d/metrics/kv_ops/phases/access/summary
```

<details>
<summary><strong>Example Response:</strong></summary>

```json
{
  "success": true,
  "metric": "kv_ops",
  "snapshot": "faa940df-70a5-46fa-aeee-2f02747a903d",
  "phase": "access",
  "summary": {
    "count": 1800,
    "avg": 1250.5,
    "min": 800.2,
    "max": 2000.8,
    "p50": 1240.3,
    "p80": 1500.7,
    "p95": 1800.2,
    "p99": 1950.5
  }
}
```
</details>

### Parameters and label filters

All endpoints support label filters. The label filters are specified as query parameters. The label filters are applied to the metric data.

**Query Parameters:**
- `percentiles` (`p`) (optional): Comma-separated list of percentile values (0.0-1.0). Defaults to `0.5,0.8,0.95,0.99`.
- `key=value` (optional): Label filter. Can be specified multiple times.

**Example Request:**
```
// Label filters
GET /snapshots/{id}/metrics/{metric}?node=node1&bucket=mybucket
GET /snapshots/{id}/metrics/{metric}/summary?instance=instance1

// Percentiles
GET /snapshots/{id}/metrics/{metric}/summary?percentiles=0.5,0.8,0.95,0.99

// Both
GET /snapshots/{id}/metrics/{metric}/summary?percentiles=0.9&node=node1&bucket=mybucket&instance=instance1
```
---


## PromQL Query API

The PromQL Query API provides a Prometheus-compatible interface for querying metrics using the [PromQL Prometheus Query Language HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/). The snapshot/job is specified using the `job` label in your PromQL queries.

### GET /api/v1/query

Execute an instant PromQL query at a specific point in time.

**Query Parameters:**
- `query` (required): PromQL query string
- `time` (optional): Unix timestamp in seconds. Defaults to current time (last value within the last ~30 seconds).

**Example Request:**
```
GET /api/v1/query?query=sys_cpu_utilization_rate{job="snapshot-id"}&time=1700000000
```

<details>
<summary><strong>Example Response:</strong></summary>

```json
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {
          "job": "snapshot-id",
          "node": "node1",
          "bucket": "default"
        },
        "value": [1700000000, "45.5"]
      }
    ]
  }
}
```
</details>

### GET /api/v1/query_range

Execute a range PromQL query over a time interval.

**Query Parameters:**
- `query` (required): PromQL query string
- `start` (required): Start timestamp (Unix seconds)
- `end` (required): End timestamp (Unix seconds)
- `step` (optional): Query resolution step width (e.g., "15s", "1m"). Defaults to "15s".

**Example Request:**
```
GET /api/v1/query_range?query=sys_cpu_utilization_rate{job="snapshot-id"}&start=1700000000&end=1700003600&step=15s
```

<details>
<summary><strong>Example Response:</strong></summary>

```json
{
  "status": "success",
  "data": {
    "resultType": "matrix",
    "result": [
      {
        "metric": {
          "job": "snapshot-id",
          "node": "node1",
          "bucket": "default"
        },
        "values": [
          [1700000000, "45.5"],
          [1700000015, "46.2"],
          [1700000030, "44.8"]
        ]
      }
    ]
  }
}
```
</details>

### GET /api/v1/series

Discover available time series matching label matchers.

**Query Parameters:**
- `match[]` (required): Series selector. Can be specified multiple times.

**Example Request:**
```
GET /api/v1/series?match[]=sys_cpu_utilization_rate{job="snapshot-id"}
```

**Example Response:**
```json
{
  "status": "success",
  "data": []
}
```

**Note:** Series discovery is currently a stub implementation and returns an empty array.

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

For PromQL endpoints, errors follow Prometheus format:

```json
{
  "status": "error",
  "error": "Error message",
  "errorType": "bad_data"
}
```

## CORS

All endpoints support CORS and can be accessed from web browsers. The following headers are set:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`
