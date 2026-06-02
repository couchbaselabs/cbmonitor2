package promql

import (
	"fmt"
	"strings"

	"github.com/prometheus/prometheus/model/labels"
	"github.com/prometheus/prometheus/promql/parser"
)

// QueryPlan represents an optimized query execution plan
type QueryPlan struct {
	BaseExpr      parser.Expr
	SeriesQueries []SeriesQuery
	Aggregation   *AggregationPlan
	Function      *FunctionPlan
}

// SeriesQuery represents a single series query to Couchbase
type SeriesQuery struct {
	MetricName string
	Snapshot   string // Extracted from 'job' label in PromQL
	Labels     map[string]string // Additional labels to filter (including node, instance, etc.)
}

// AggregationPlan represents aggregation operations
type AggregationPlan struct {
	Operation string // sum, avg, max, min, count
	By        []string
	Without   []string
}

// FunctionPlan represents function operations
type FunctionPlan struct {
	Name      string // rate, increase, irate, etc.
	Range     string // For range functions like rate[5m]
	Parameter string // Optional parameter
}

// PlanQuery creates an optimized query plan from a PromQL expression
func PlanQuery(expr parser.Expr, snapshotID string) (*QueryPlan, error) {
	plan := &QueryPlan{
		BaseExpr: expr,
	}

	// Walk the AST to extract series selectors and operations
	err := parser.Walk(&queryPlanner{
		plan:       plan,
		snapshotID: snapshotID,
	}, expr, nil)

	if err != nil {
		return nil, fmt.Errorf("failed to plan query: %w", err)
	}

	return plan, nil
}

// queryPlanner implements parser.Visitor to walk the AST
type queryPlanner struct {
	plan       *QueryPlan
	snapshotID string
}

func (v *queryPlanner) Visit(node parser.Node, path []parser.Node) (parser.Visitor, error) {
	switch n := node.(type) {
	case *parser.VectorSelector:
		// Extract series selector
		seriesQuery, err := v.extractSeriesSelector(n)
		if err != nil {
			return nil, err
		}
		v.plan.SeriesQueries = append(v.plan.SeriesQueries, seriesQuery)

	case *parser.AggregateExpr:
		// Extract aggregation
		v.plan.Aggregation = &AggregationPlan{
			Operation: n.Op.String(),
			By:        v.extractLabels(n.Grouping),
			Without:   v.extractLabels(n.Grouping), // Simplified - would need to check Without flag
		}

	case *parser.Call:
		// Extract function call
		v.plan.Function = &FunctionPlan{
			Name: n.Func.Name,
		}
		// Extract range parameter if it's a range function
		if len(n.Args) > 0 {
			if matrixSelector, ok := n.Args[0].(*parser.MatrixSelector); ok {
				v.plan.Function.Range = matrixSelector.Range.String()
			}
		}
	}

	return v, nil
}

// extractSeriesSelector extracts series information from a vector selector
func (v *queryPlanner) extractSeriesSelector(selector *parser.VectorSelector) (SeriesQuery, error) {
	query := SeriesQuery{
		MetricName: selector.Name,
		Snapshot:   v.snapshotID, // Will be overridden by 'job' label if present
		Labels:     make(map[string]string),
	}

	// Extract labels from matchers
	for _, matcher := range selector.LabelMatchers {
		labelName := matcher.Name
		labelValue := matcher.Value

		switch matcher.Type {
		case labels.MatchEqual:
			// Map known labels to query parameters
			switch labelName {
			case "job", "snapshot", "snapshot_id":
				// 'job' label maps to snapshot in get_metric_for function
				query.Snapshot = labelValue
			default:
				// Store as additional label filter (node, instance, bucket, etc.)
				query.Labels[labelName] = labelValue
			}

		case labels.MatchNotEqual:
			// For !=, we'll need to filter in WHERE clause
			query.Labels["!"+labelName] = labelValue

		case labels.MatchRegexp:
			// For =~, we'll need regex matching in WHERE clause
			query.Labels["=~"+labelName] = labelValue

		case labels.MatchNotRegexp:
			// For !~, we'll need negative regex matching
			query.Labels["!~"+labelName] = labelValue
		}
	}

	// Default snapshot if not provided (from job label or context)
	if query.Snapshot == "" {
		query.Snapshot = v.snapshotID
	}

	return query, nil
}

// extractLabels extracts label names from grouping
func (v *queryPlanner) extractLabels(grouping []string) []string {
	return grouping
}

// GetMetricName extracts the metric name from the expression
func GetMetricName(expr parser.Expr) string {
	switch e := expr.(type) {
	case *parser.VectorSelector:
		return e.Name
	case *parser.MatrixSelector:
		return GetMetricName(e.VectorSelector)
	case *parser.Call:
		if len(e.Args) > 0 {
			return GetMetricName(e.Args[0])
		}
	}
	return ""
}

// HasMultipleSeries checks if the query involves multiple series
func (p *QueryPlan) HasMultipleSeries() bool {
	return len(p.SeriesQueries) > 1
}

// ShouldBatch determines if queries should be batched
func (p *QueryPlan) ShouldBatch() bool {
	// Batch if we have multiple series with the same metric name
	if len(p.SeriesQueries) <= 1 {
		return false
	}

	// Check if all series have the same metric name
	firstMetric := p.SeriesQueries[0].MetricName
	for _, sq := range p.SeriesQueries[1:] {
		if sq.MetricName != firstMetric {
			return false
		}
	}

	// Batch if we have 5-20 series (adaptive threshold)
	return len(p.SeriesQueries) >= 5 && len(p.SeriesQueries) <= 20
}

// GetBatchedQueries groups queries by metric name for batching
func (p *QueryPlan) GetBatchedQueries() map[string][]SeriesQuery {
	batched := make(map[string][]SeriesQuery)
	for _, sq := range p.SeriesQueries {
		batched[sq.MetricName] = append(batched[sq.MetricName], sq)
	}
	return batched
}

// String returns a human-readable representation of the plan
func (p *QueryPlan) String() string {
	var parts []string
	parts = append(parts, fmt.Sprintf("SeriesQueries: %d", len(p.SeriesQueries)))
	if p.Aggregation != nil {
		parts = append(parts, fmt.Sprintf("Aggregation: %s", p.Aggregation.Operation))
	}
	if p.Function != nil {
		parts = append(parts, fmt.Sprintf("Function: %s", p.Function.Name))
	}
	return strings.Join(parts, ", ")
}
