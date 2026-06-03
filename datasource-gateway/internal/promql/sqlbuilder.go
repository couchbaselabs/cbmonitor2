package promql

import (
	"fmt"
	"strings"
	"time"

	"github.com/couchbase/datasource-gateway/internal/querybuilder"
)

const (
	// defaultKeyspace is used when the query context doesn't specify one; the
	// real keyspace (bucket.scope.collection) is supplied per query.
	defaultKeyspace = "cbmonitor._default._default"

	// instantLookback is how far back an instant query reads to find the most
	// recent sample.
	instantLookback = 5 * time.Minute
)

// SQLBuilder builds SQL++ queries from a query plan. It emits the raw,
// time-bounded, per-series samples (one query per selector). rate/irate/
// increase and aggregation are applied in Go (see transformer.go) after the
// samples are fetched — rate must be computed per series before any
// aggregation, so neither can be pushed into SQL.
type SQLBuilder struct {
	plan     *QueryPlan
	queryCtx *QueryContext
}

// NewSQLBuilder creates a new SQL++ query builder.
func NewSQLBuilder(plan *QueryPlan, queryCtx *QueryContext) *SQLBuilder {
	return &SQLBuilder{plan: plan, queryCtx: queryCtx}
}

// Build generates one SQL++ query per series selector in the plan.
func (b *SQLBuilder) Build() ([]string, error) {
	if len(b.plan.SeriesQueries) == 0 {
		return nil, fmt.Errorf("query has no series selector")
	}
	queries := make([]string, 0, len(b.plan.SeriesQueries))
	for _, sq := range b.plan.SeriesQueries {
		queries = append(queries, b.buildSeriesQuery(sq))
	}
	return queries, nil
}

// buildSeriesQuery selects a single metric's samples. metric_name, job, and the
// label matchers filter the document BEFORE UNNEST (efficient); the time window
// is bound into the _timeseries range so only in-window samples are expanded.
func (b *SQLBuilder) buildSeriesQuery(sq SeriesQuery) string {
	fromMillis, toMillis := b.timeRangeMillis()

	conditions := []string{fmt.Sprintf("d.metric_name = '%s'", escapeSQLString(sq.MetricName))}
	if labelWhere := b.buildLabelWhereClause(sq); labelWhere != "" {
		conditions = append(conditions, labelWhere)
	}

	return fmt.Sprintf(
		"SELECT MILLIS_TO_STR(t._t) AS time, t._v0 AS `value`, d.labels AS labels "+
			"FROM %s AS d UNNEST _timeseries(d, {'ts_ranges':[%d, %d]}) AS t WHERE %s",
		b.keyspace(), fromMillis, toMillis, strings.Join(conditions, " AND "),
	)
}

// keyspace returns the configured metrics keyspace (bucket.scope.collection),
// falling back to the default when unset.
func (b *SQLBuilder) keyspace() string {
	if b.queryCtx != nil && b.queryCtx.Keyspace != "" {
		return b.queryCtx.Keyspace
	}
	return defaultKeyspace
}

// timeRangeMillis returns the [from,to] window in Unix milliseconds. Range
// queries use the requested window; instant queries read back instantLookback
// from the evaluation time.
func (b *SQLBuilder) timeRangeMillis() (int64, int64) {
	if b.queryCtx.IsRange {
		return b.queryCtx.StartTime.UnixMilli(), b.queryCtx.EndTime.UnixMilli()
	}
	return b.queryCtx.Time.Add(-instantLookback).UnixMilli(), b.queryCtx.Time.UnixMilli()
}

// buildLabelWhereClause builds the job/snapshot + label-matcher conditions
// (everything except metric_name) via the shared query builder.
func (b *SQLBuilder) buildLabelWhereClause(sq SeriesQuery) string {
	var filters []querybuilder.LabelFilter

	// Add the job/snapshot equality filter unless the selector already carried
	// an explicit job matcher (preserved below with its own operator).
	if !hasJobMatcher(sq.Labels) {
		snapshot := sq.Snapshot
		if snapshot == "" {
			snapshot = b.queryCtx.SnapshotID
		}
		if snapshot != "" {
			filters = append(filters, querybuilder.LabelFilter{Name: "job", Value: snapshot, Op: "="})
		}
	}

	for labelName, labelValue := range sq.Labels {
		switch {
		case strings.HasPrefix(labelName, "!~"):
			filters = append(filters, querybuilder.LabelFilter{Name: strings.TrimPrefix(labelName, "!~"), Value: labelValue, Op: "!~"})
		case strings.HasPrefix(labelName, "=~"):
			filters = append(filters, querybuilder.LabelFilter{Name: strings.TrimPrefix(labelName, "=~"), Value: labelValue, Op: "=~"})
		case strings.HasPrefix(labelName, "!"):
			filters = append(filters, querybuilder.LabelFilter{Name: strings.TrimPrefix(labelName, "!"), Value: labelValue, Op: "!="})
		default:
			filters = append(filters, querybuilder.LabelFilter{Name: labelName, Value: labelValue, Op: "="})
		}
	}

	return querybuilder.BuildLabelWhereClauseFromFilters(filters)
}

// hasJobMatcher reports whether the selector already constrains job/snapshot
// (with any operator), so the default equality job filter isn't added twice.
func hasJobMatcher(labels map[string]string) bool {
	for name := range labels {
		actual := name
		switch {
		case strings.HasPrefix(actual, "!~"):
			actual = strings.TrimPrefix(actual, "!~")
		case strings.HasPrefix(actual, "=~"):
			actual = strings.TrimPrefix(actual, "=~")
		case strings.HasPrefix(actual, "!"):
			actual = strings.TrimPrefix(actual, "!")
		}
		if actual == "job" || actual == "snapshot" || actual == "snapshot_id" {
			return true
		}
	}
	return false
}

func escapeSQLString(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}
