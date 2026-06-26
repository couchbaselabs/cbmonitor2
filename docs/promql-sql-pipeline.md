# PromQL-to-SQL++ Pipeline

This document describes the backend pipeline that translates Prometheus Query Language (PromQL) queries into Couchbase SQL++ and returns results in the standard Prometheus HTTP API format. This is what powers the Couchbase datasource's Prometheus-compatible `/query`, `/query_range`, and `/series` endpoints.

## Purpose

cbmonitor stores time-series metrics in a Couchbase bucket using a document-per-metric format with embedded time-series values. The PromQL endpoints exist so Grafana can query those metrics using its native Prometheus data source — panel queries written in PromQL work against Couchbase without requiring a separate Prometheus or Mimir installation.

## Pipeline Stages

```
HTTP request  (query=<promql>&start=...&end=...&step=...)
      │
      ▼
  pkg/handlers/prometheus.go   ← HTTP boundary: parse params, call pipeline, return JSON
      │
      ▼
  ParseQueryContext()           ← pkg/promql/parser.go: parse time/range/step into QueryContext
      │
      ▼
  ParseQuery()                  ← pkg/promql/parser.go: parse PromQL string → Prometheus AST (Expr)
      │
      ▼
  PlanQuery()                   ← pkg/promql/planner.go: walk AST → QueryPlan
      │                           (extracts SeriesQueries, AggregationPlan, FunctionPlan)
      ▼
  NewSQLBuilder(plan, ctx).Build()   ← pkg/promql/sqlbuilder.go: emit SQL++ strings
      │
      ▼
  couchbaseService.Query()      ← pkg/services/couchbase.go: execute against Couchbase N1QL
      │
      ▼
  TransformResults()            ← pkg/promql/transformer.go: shape []QueryResult → PrometheusResult
      │
      ▼
HTTP response  ({"status":"success","data":{"resultType":"matrix","result":[...]}})
```

## Stage Details

### 1. HTTP boundary — `pkg/handlers/prometheus.go`

Entry points:
- `HandleQuery` → instant query
- `HandleQueryRange` → range query
- `HandleSeries` → series discovery

These handlers extract `query`, `time`, `start`, `end`, `step` from the request, call `ParseQueryContext`, run the pipeline, and encode the result as JSON. Error responses follow the Prometheus HTTP API error shape (`{"status":"error","errorType":"...","error":"..."}`).

### 2. Query context — `pkg/promql/parser.go`

`ParseQueryContext` populates a `QueryContext`:

```go
type QueryContext struct {
    Query      string
    Time       time.Time      // instant queries
    StartTime  time.Time      // range queries
    EndTime    time.Time
    Step       time.Duration  // defaults to 15s
    IsRange    bool
    SnapshotID string         // optional override from URL path
}
```

Time values accept RFC3339 strings or Unix timestamps (seconds or milliseconds auto-detected above `1e10`). `ParseQuery` calls `prometheus/promql/parser.ParseExpr` to produce the AST.

### 3. Query planner — `pkg/promql/planner.go`

`PlanQuery` walks the Prometheus AST using `parser.Walk` and fills a `QueryPlan`:

```go
type QueryPlan struct {
    SeriesQueries []SeriesQuery    // one per VectorSelector in the AST
    Aggregation   *AggregationPlan // from AggregateExpr nodes
    Function      *FunctionPlan    // from Call nodes (rate, irate, increase)
}
```

Each `VectorSelector` becomes a `SeriesQuery`. Label matchers are classified:
- `job` / `snapshot` / `snapshot_id` → `SeriesQuery.Snapshot` (identifies the Couchbase document)
- `=` matches → `Labels["key"] = value`
- `!=` matches → `Labels["!key"] = value`
- `=~` regex → `Labels["=~key"] = value`
- `!~` negative regex → `Labels["!~key"] = value`

The batch heuristic (`ShouldBatch`) groups queries with the same metric name when there are 5–20 series. Batching uses `UNION ALL` in the emitted SQL++.

### 4. SQL++ builder — `pkg/promql/sqlbuilder.go`

`SQLBuilder.Build()` emits one or more SQL++ query strings. The base template queries the Couchbase time-series function:

```sql
SELECT t._t AS time_millis, MILLIS_TO_STR(t._t) AS time, t._v0 AS `value`, d.labels AS labels
FROM cbmonitor._default._default AS d
UNNEST _timeseries(d, {'ts_ranges':[0, 9223372036854775807]}) AS t
WHERE d.metric_name = '<metric>'
  AND <label conditions>
  AND d.time_millis >= <start_ms> AND d.time_millis <= <end_ms>
```

Label conditions are built by `pkg/querybuilder.BuildLabelWhereClauseFromFilters`, which handles `=`, `!=`, `=~`, and `!~` operators. The `job` label is mapped to the Couchbase `labels.job` field, which stores the snapshot ID.

**Important**: label filters are embedded in the inner subquery (before `UNNEST`), not as a post-UNNEST `WHERE` clause. This is intentional for query performance — filtering at the document level before the time-series unnest avoids scanning all time points of irrelevant documents.

For instant queries, the time window is `±30s` around the requested timestamp.

### 5. Result transformation — `pkg/promql/transformer.go`

`TransformResults` groups `[]QueryResult` by label set into `Series` objects and returns a `PrometheusResult`. For range queries, samples within each series are sorted by timestamp. Aggregation (`applyAggregation`) is applied when the plan has an `AggregationPlan`.

**Current limitation**: `rate`, `irate`, and `increase` function transformations (`applyFunction`) are recognised but not yet fully implemented — the inner switch returns the series list unchanged for these cases. The comment `// Will be used after implementing function application` marks this gap. Rate-like operations currently need to be handled upstream (e.g., by using pre-computed rate metrics stored in the bucket).

## Adding Support for a New PromQL Function

1. Add the function name to the `applyFunction` switch in `pkg/promql/transformer.go`.
2. Implement the transformation over `[]interface{}` (each element is a `*Series`).
3. Add a corresponding case in `SQLBuilder.applyFunction` in `pkg/promql/sqlbuilder.go` if the function can be pushed down to SQL++ (e.g., via a Couchbase analytics function).
4. Add a test in `pkg/handlers/prometheus_test.go` using a pre-populated fixture dataset.

## Series Discovery (`/series`)

`HandleSeries` in `pkg/handlers/prometheus.go` uses a distinct code path that queries the Couchbase bucket for distinct `(metric_name, labels)` combinations matching the `match[]` selector. It does not go through the full planner/transformer pipeline. Results are returned as the Prometheus `[{"__name__":"...","job":"...","node":"..."}]` array shape.

## Known Constraints

- The pipeline only supports the subset of PromQL that maps cleanly onto single-metric Couchbase document queries. Complex subqueries, binary operations across different metrics, and recording rules are not supported.
- Regex label matchers are translated into SQL++ `REGEXP_CONTAINS` calls. Performance depends on whether the bucket has appropriate indexes on the `labels` field.
- The `step` parameter controls how Grafana aligns the time axis, but the underlying Couchbase query returns raw stored data points. No downsampling or interpolation is applied server-side.
