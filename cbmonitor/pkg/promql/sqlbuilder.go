package promql

import (
	"fmt"
	"strings"
	"time"
)

// SQLBuilder builds SQL++ queries from query plans
type SQLBuilder struct {
	plan        *QueryPlan
	queryCtx    *QueryContext
	useBatching bool
}

// NewSQLBuilder creates a new SQL++ query builder
func NewSQLBuilder(plan *QueryPlan, queryCtx *QueryContext) *SQLBuilder {
	return &SQLBuilder{
		plan:        plan,
		queryCtx:    queryCtx,
		useBatching: plan.ShouldBatch(),
	}
}

// Build generates SQL++ query string(s) from the plan
func (b *SQLBuilder) Build() ([]string, error) {
	if b.useBatching {
		return b.buildBatchedQueries()
	}
	return b.buildIndividualQueries()
}

// buildIndividualQueries builds separate queries for each series
func (b *SQLBuilder) buildIndividualQueries() ([]string, error) {
	var queries []string

	for _, seriesQuery := range b.plan.SeriesQueries {
		query, err := b.buildSeriesQuery(seriesQuery)
		if err != nil {
			return nil, err
		}
		queries = append(queries, query)
	}

	return queries, nil
}

// buildBatchedQueries builds batched queries using UNION ALL
func (b *SQLBuilder) buildBatchedQueries() ([]string, error) {
	batched := b.plan.GetBatchedQueries()
	var queries []string

	for _, seriesQueries := range batched {
		if len(seriesQueries) == 1 {
			// Single series, no need to batch
			query, err := b.buildSeriesQuery(seriesQueries[0])
			if err != nil {
				return nil, err
			}
			queries = append(queries, query)
			continue
		}

		// Build UNION ALL query
		var unionParts []string
		for _, sq := range seriesQueries {
			part := b.buildSeriesQueryPart(sq)
			unionParts = append(unionParts, part)
		}

		// Combine with UNION ALL and add aggregation if needed
		unionQuery := strings.Join(unionParts, " UNION ALL ")

		// If aggregation is needed, wrap in aggregation query
		if b.plan.Aggregation != nil {
			unionQuery = b.wrapWithAggregation(unionQuery)
		}

		queries = append(queries, unionQuery)
	}

	return queries, nil
}

// buildSeriesQuery builds a SQL++ query for a single series
func (b *SQLBuilder) buildSeriesQuery(seriesQuery SeriesQuery) (string, error) {
	baseQuery := b.buildSeriesQueryPart(seriesQuery)

	// Apply function transformation if needed
	if b.plan.Function != nil {
		baseQuery = b.applyFunction(baseQuery)
	}

	// Apply aggregation if needed
	if b.plan.Aggregation != nil {
		baseQuery = b.wrapWithAggregation(baseQuery)
	}

	return baseQuery, nil
}

// buildSeriesQueryPart builds the base SQL++ query part for a series
func (b *SQLBuilder) buildSeriesQueryPart(seriesQuery SeriesQuery) string {
	// Build metrics_filter function call
	metricFilter := b.buildMetricFilter(seriesQuery)

	// Build time range
	fromMillis := b.queryCtx.StartTime.UnixMilli()
	toMillis := b.queryCtx.EndTime.UnixMilli()
	if !b.queryCtx.IsRange {
		// For instant queries, use a small range around the time (~30s)
		fromMillis = b.queryCtx.Time.UnixMilli() - 30000
		toMillis = b.queryCtx.Time.UnixMilli() + 1000
	}

	// Build SELECT clause
	selectClause := b.buildSelectClause(seriesQuery)

	// Build WHERE clause
	whereClause := b.buildWhereClause(seriesQuery)

	// Construct full query
	// Note: time_range(t._t) is handled by the datasource plugin, but we include it for completeness
	if whereClause != "" {
		query := fmt.Sprintf(
			"SELECT %s FROM %s AS d UNNEST _timeseries(d, {'ts_ranges':[%d, %d]}) AS t WHERE %s",
			selectClause,
			metricFilter,
			fromMillis,
			toMillis,
			whereClause,
		)
		return query
	}

	// If no WHERE clause, still include time_range for datasource plugin
	query := fmt.Sprintf(
		"SELECT %s FROM %s AS d UNNEST _timeseries(d, {'ts_ranges':[%d, %d]}) AS t WHERE time_range(t._t)",
		selectClause,
		metricFilter,
		fromMillis,
		toMillis,
	)

	return query
}

// buildMetricFilter builds the get_metric_for function call
func (b *SQLBuilder) buildMetricFilter(seriesQuery SeriesQuery) string {
	// get_metric_for(metric_name, snapshot)
	// snapshot comes from 'job' label in PromQL
	snapshot := seriesQuery.Snapshot
	if snapshot == "" {
		snapshot = b.queryCtx.SnapshotID
	}
	if snapshot == "" {
		// If no snapshot provided, use placeholder (will need to be provided)
		snapshot = "$snapshot"
	}

	return fmt.Sprintf("get_metric_for('%s', '%s')", seriesQuery.MetricName, snapshot)
}

// buildSelectClause builds the SELECT clause
func (b *SQLBuilder) buildSelectClause(seriesQuery SeriesQuery) string {
	parts := []string{
		"MILLIS_TO_STR(t._t) AS time",
		"t._v0 AS `value`",
	}

	// Add label fields if needed
	if len(seriesQuery.Labels) > 0 || b.plan.Aggregation != nil {
		// Include labels for grouping/aggregation
		parts = append(parts, "d.labels")
	}

	return strings.Join(parts, ", ")
}

// buildWhereClause builds the WHERE clause
func (b *SQLBuilder) buildWhereClause(seriesQuery SeriesQuery) string {
	conditions := []string{}

	// Add label filters
	for labelName, labelValue := range seriesQuery.Labels {
		if strings.HasPrefix(labelName, "!") {
			// NOT EQUAL
			actualLabel := strings.TrimPrefix(labelName, "!")
			conditions = append(conditions, fmt.Sprintf(`d.labels.%s != '%s'`, escapeLabel(actualLabel), labelValue))
		} else if strings.HasPrefix(labelName, "=~") {
			// REGEX MATCH
			actualLabel := strings.TrimPrefix(labelName, "=~")
			conditions = append(conditions, fmt.Sprintf(`d.labels.%s LIKE '%s'`, escapeLabel(actualLabel), labelValue))
		} else if strings.HasPrefix(labelName, "!~") {
			// NOT REGEX MATCH
			actualLabel := strings.TrimPrefix(labelName, "!~")
			conditions = append(conditions, fmt.Sprintf(`d.labels.%s NOT LIKE '%s'`, escapeLabel(actualLabel), labelValue))
		} else {
			// EQUAL
			conditions = append(conditions, fmt.Sprintf(`d.labels.%s = '%s'`, escapeLabel(labelName), labelValue))
		}
	}

	return strings.Join(conditions, " AND ")
}

// applyFunction applies PromQL function transformations
func (b *SQLBuilder) applyFunction(query string) string {
	if b.plan.Function == nil {
		return query
	}

	switch b.plan.Function.Name {
	case "rate", "irate", "increase":
		// These need to be calculated post-query for now
		// We'll mark the query for post-processing
		return query
	default:
		return query
	}
}

// wrapWithAggregation wraps query with aggregation
func (b *SQLBuilder) wrapWithAggregation(query string) string {
	if b.plan.Aggregation == nil {
		return query
	}

	// Build GROUP BY clause
	var groupBy []string
	if len(b.plan.Aggregation.By) > 0 {
		for _, label := range b.plan.Aggregation.By {
			groupBy = append(groupBy, fmt.Sprintf("d.labels.%s", escapeLabel(label)))
		}
	}
	groupBy = append(groupBy, "t._t") // Always group by time

	// Build aggregation function
	aggFunc := strings.ToUpper(b.plan.Aggregation.Operation)
	if aggFunc == "" {
		aggFunc = "SUM"
	}

	// Wrap query
	wrapped := fmt.Sprintf(
		"SELECT time, %s(value) AS value %s FROM (%s) AS subq GROUP BY %s ORDER BY time",
		aggFunc,
		b.buildLabelSelect(groupBy),
		query,
		strings.Join(groupBy, ", "),
	)

	return wrapped
}

// buildLabelSelect builds label selection for GROUP BY
func (b *SQLBuilder) buildLabelSelect(groupBy []string) string {
	var labels []string
	for _, gb := range groupBy {
		if strings.HasPrefix(gb, "d.labels.") {
			labels = append(labels, gb)
		}
	}
	if len(labels) > 0 {
		return ", " + strings.Join(labels, ", ")
	}
	return ""
}

// escapeLabel escapes label names for SQL++
func escapeLabel(label string) string {
	// Use backticks for labels with special characters
	if strings.ContainsAny(label, "-. ") {
		return fmt.Sprintf("`%s`", label)
	}
	return label
}

// GetTimeRange returns the time range for the query
func (b *SQLBuilder) GetTimeRange() (time.Time, time.Time) {
	if b.queryCtx.IsRange {
		return b.queryCtx.StartTime, b.queryCtx.EndTime
	}
	// For instant queries, return a small range
	return b.queryCtx.Time.Add(-time.Second), b.queryCtx.Time.Add(time.Second)
}
