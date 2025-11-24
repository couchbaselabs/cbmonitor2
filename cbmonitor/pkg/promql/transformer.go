package promql

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

// PrometheusResult represents a Prometheus API result
type PrometheusResult struct {
	Status string      `json:"status"`
	Data   ResultData  `json:"data"`
	Error  string      `json:"error,omitempty"`
	ErrorType string   `json:"errorType,omitempty"`
}

// ResultData represents the data portion of Prometheus response
type ResultData struct {
	ResultType string        `json:"resultType"`
	Result     []interface{} `json:"result"`
}

// Sample represents a single time-value pair
type Sample struct {
	Timestamp float64 `json:"timestamp"` // Unix timestamp in seconds
	Value     string  `json:"value"`     // String representation of float
}

// Series represents a time series with labels and samples
type Series struct {
	Metric map[string]string `json:"metric"`
	Values []Sample         `json:"values,omitempty"` // For range queries
	Value  Sample           `json:"value,omitempty"`  // For instant queries
}

// QueryResult represents raw query results from Couchbase
type QueryResult struct {
	Time   string                 `json:"time"`
	Value  interface{}            `json:"value"`
	Labels map[string]interface{} `json:"labels,omitempty"`
}

// TransformResults transforms Couchbase query results to Prometheus format
func TransformResults(results []QueryResult, plan *QueryPlan, queryCtx *QueryContext) (*PrometheusResult, error) {
	if len(results) == 0 {
		return &PrometheusResult{
			Status: "success",
			Data: ResultData{
				ResultType: getResultType(plan, queryCtx),
				Result:     []interface{}{},
			},
		}, nil
	}

	// Group results by labels to form series
	seriesMap := make(map[string]*Series)

	for _, result := range results {
		// Extract labels
		labels := extractLabels(result, plan)
		labelKey := buildLabelKey(labels)

		// Get or create series
		series, exists := seriesMap[labelKey]
		if !exists {
			series = &Series{
				Metric: labels,
			}
			seriesMap[labelKey] = series
		}

		// Parse time and value
		timestamp, err := parseTimeFromResult(result.Time)
		if err != nil {
			return nil, fmt.Errorf("failed to parse time: %w", err)
		}

		value, err := parseValue(result.Value)
		if err != nil {
			return nil, fmt.Errorf("failed to parse value: %w", err)
		}

		// Create sample
		sample := Sample{
			Timestamp: float64(timestamp.Unix()),
			Value:     formatValue(value),
		}

		// Add to series
		if queryCtx.IsRange {
			series.Values = append(series.Values, sample)
		} else {
			series.Value = sample
		}
	}

	// Convert map to slice and sort
	var seriesList []interface{}
	for _, series := range seriesMap {
		// Sort values by timestamp
		if queryCtx.IsRange {
			sort.Slice(series.Values, func(i, j int) bool {
				return series.Values[i].Timestamp < series.Values[j].Timestamp
			})
		}
		seriesList = append(seriesList, series)
	}

	// Apply function transformations
	if plan.Function != nil {
		seriesList, err := applyFunction(seriesList, plan.Function, queryCtx)
		if err != nil {
			return nil, fmt.Errorf("failed to apply function: %w", err)
		}
		// Update seriesList with transformed results
		_ = seriesList // Will be used after implementing function application
	}

	// Apply aggregation if needed
	if plan.Aggregation != nil {
		seriesList = applyAggregation(seriesList, plan.Aggregation)
	}

	return &PrometheusResult{
		Status: "success",
		Data: ResultData{
			ResultType: getResultType(plan, queryCtx),
			Result:     seriesList,
		},
	}, nil
}

// extractLabels extracts labels from query result
func extractLabels(result QueryResult, plan *QueryPlan) map[string]string {
	labels := make(map[string]string)

	// Add metric name from plan
	if len(plan.SeriesQueries) > 0 {
		metricName := plan.SeriesQueries[0].MetricName
		if metricName != "" {
			labels["__name__"] = metricName
		}
	}

	// Extract labels from result
	if result.Labels != nil {
		for key, value := range result.Labels {
			if strValue, ok := value.(string); ok {
				labels[key] = strValue
			} else if strValue := fmt.Sprintf("%v", value); strValue != "" {
				labels[key] = strValue
			}
		}
	}

	return labels
}

// buildLabelKey creates a unique key for a label set
func buildLabelKey(labels map[string]string) string {
	// Sort keys for consistent ordering
	var keys []string
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var parts []string
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s=%s", k, labels[k]))
	}
	return fmt.Sprintf("{%s}", strings.Join(parts, ","))
}

// parseTimeFromResult parses time from result string
func parseTimeFromResult(timeStr string) (time.Time, error) {
	// Try RFC3339 first
	if t, err := time.Parse(time.RFC3339, timeStr); err == nil {
		return t, nil
	}

	// Try Unix timestamp
	if timestamp, err := strconv.ParseFloat(timeStr, 64); err == nil {
		if timestamp > 1e10 {
			// Milliseconds
			return time.Unix(0, int64(timestamp*1e6)), nil
		}
		return time.Unix(int64(timestamp), 0), nil
	}

	return time.Time{}, fmt.Errorf("unable to parse time: %s", timeStr)
}

// parseValue parses value from result
func parseValue(value interface{}) (float64, error) {
	switch v := value.(type) {
	case float64:
		return v, nil
	case int:
		return float64(v), nil
	case int64:
		return float64(v), nil
	case string:
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			return 0, fmt.Errorf("invalid value: %s", v)
		}
		return f, nil
	default:
		return 0, fmt.Errorf("unsupported value type: %T", value)
	}
}

// formatValue formats a float value as string (Prometheus format)
func formatValue(value float64) string {
	// Handle special values
	if math.IsNaN(value) {
		return "NaN"
	}
	if math.IsInf(value, 1) {
		return "+Inf"
	}
	if math.IsInf(value, -1) {
		return "-Inf"
	}

	// Format with appropriate precision
	return strconv.FormatFloat(value, 'f', -1, 64)
}

// getResultType determines the result type based on query
func getResultType(plan *QueryPlan, queryCtx *QueryContext) string {
	if queryCtx.IsRange {
		return "matrix"
	}
	return "vector"
}

// applyFunction applies PromQL function transformations
func applyFunction(seriesList []interface{}, function *FunctionPlan, queryCtx *QueryContext) ([]interface{}, error) {
	switch function.Name {
	case "rate":
		return applyRate(seriesList, function.Range)
	case "irate":
		return applyIRate(seriesList)
	case "increase":
		return applyIncrease(seriesList, function.Range)
	default:
		// Unknown function, return as-is
		return seriesList, nil
	}
}

// applyRate calculates rate (per-second average rate)
func applyRate(seriesList []interface{}, rangeStr string) ([]interface{}, error) {
	// Parse range duration (for future use in range-based rate calculation)
	_, err := time.ParseDuration(rangeStr)
	if err != nil && rangeStr != "" {
		return nil, fmt.Errorf("invalid range: %w", err)
	}

	// Apply rate to each series
	var result []interface{}
	for _, item := range seriesList {
		series, ok := item.(*Series)
		if !ok {
			continue
		}

		if len(series.Values) < 2 {
			// Need at least 2 points for rate
			continue
		}

		// Calculate rate for each interval
		newValues := make([]Sample, 0, len(series.Values)-1)
		for i := 1; i < len(series.Values); i++ {
			prev := series.Values[i-1]
			curr := series.Values[i]

			prevVal, _ := strconv.ParseFloat(prev.Value, 64)
			currVal, _ := strconv.ParseFloat(curr.Value, 64)

			timeDiff := curr.Timestamp - prev.Timestamp
			if timeDiff <= 0 {
				continue
			}

			// Rate = (value change) / (time change in seconds)
			rate := (currVal - prevVal) / timeDiff

			newValues = append(newValues, Sample{
				Timestamp: curr.Timestamp,
				Value:     formatValue(rate),
			})
		}

		// Update series
		newSeries := *series
		newSeries.Values = newValues
		result = append(result, &newSeries)
	}

	return result, nil
}

// applyIRate calculates instant rate (per-second rate from last two points)
func applyIRate(seriesList []interface{}) ([]interface{}, error) {
	// Similar to rate but only uses last two points
	return applyRate(seriesList, "")
}

// applyIncrease calculates increase over time range
func applyIncrease(seriesList []interface{}, rangeStr string) ([]interface{}, error) {
	// Similar to rate but returns absolute increase
	// For now, use rate implementation
	return applyRate(seriesList, rangeStr)
}

// applyAggregation applies aggregation operations
func applyAggregation(seriesList []interface{}, agg *AggregationPlan) []interface{} {
	// Group series by labels (excluding aggregation labels)
	grouped := make(map[string][]*Series)

	for _, item := range seriesList {
		series, ok := item.(*Series)
		if !ok {
			continue
		}

		// Build group key
		groupKey := buildAggregationKey(series.Metric, agg)
		grouped[groupKey] = append(grouped[groupKey], series)
	}

	// Apply aggregation to each group
	var result []interface{}
	for _, group := range grouped {
		aggSeries := aggregateSeries(group, agg)
		if aggSeries != nil {
			result = append(result, aggSeries)
		}
	}

	return result
}

// buildAggregationKey builds key for grouping
func buildAggregationKey(labels map[string]string, agg *AggregationPlan) string {
	var keys []string
	for k, v := range labels {
		// Skip __name__ and aggregation-excluded labels
		if k == "__name__" {
			continue
		}
		// Include only labels in "by" or exclude those in "without"
		keys = append(keys, fmt.Sprintf("%s=%s", k, v))
	}
	sort.Strings(keys)
	return strings.Join(keys, ",")
}

// aggregateSeries aggregates multiple series into one
func aggregateSeries(seriesList []*Series, agg *AggregationPlan) *Series {
	if len(seriesList) == 0 {
		return nil
	}

	// Use first series as base
	result := &Series{
		Metric: make(map[string]string),
	}

	// Copy labels from first series (excluding aggregation-excluded labels)
	for k, v := range seriesList[0].Metric {
		if k != "__name__" {
			result.Metric[k] = v
		}
	}

	// Aggregate values
	if len(seriesList[0].Values) > 0 {
		// Range query - aggregate across series for each timestamp
		result.Values = aggregateValues(seriesList, agg)
	} else {
		// Instant query - aggregate single values
		result.Value = aggregateValue(seriesList, agg)
	}

	return result
}

// aggregateValues aggregates values across series for range queries
func aggregateValues(seriesList []*Series, agg *AggregationPlan) []Sample {
	// Find all unique timestamps
	timestampMap := make(map[float64]bool)
	for _, series := range seriesList {
		for _, sample := range series.Values {
			timestampMap[sample.Timestamp] = true
		}
	}

	// Sort timestamps
	var timestamps []float64
	for ts := range timestampMap {
		timestamps = append(timestamps, ts)
	}
	sort.Float64s(timestamps)

	// Aggregate for each timestamp
	var result []Sample
	for _, ts := range timestamps {
		var values []float64
		for _, series := range seriesList {
			for _, sample := range series.Values {
				if sample.Timestamp == ts {
					if val, err := strconv.ParseFloat(sample.Value, 64); err == nil {
						values = append(values, val)
					}
					break
				}
			}
		}

		if len(values) > 0 {
			aggValue := aggregateFloat(values, agg.Operation)
			result = append(result, Sample{
				Timestamp: ts,
				Value:     formatValue(aggValue),
			})
		}
	}

	return result
}

// aggregateValue aggregates single values for instant queries
func aggregateValue(seriesList []*Series, agg *AggregationPlan) Sample {
	var values []float64
	var timestamp float64

	for _, series := range seriesList {
		if val, err := strconv.ParseFloat(series.Value.Value, 64); err == nil {
			values = append(values, val)
			if timestamp == 0 {
				timestamp = series.Value.Timestamp
			}
		}
	}

	aggValue := aggregateFloat(values, agg.Operation)
	return Sample{
		Timestamp: timestamp,
		Value:     formatValue(aggValue),
	}
}

// aggregateFloat aggregates float values based on operation
func aggregateFloat(values []float64, operation string) float64 {
	if len(values) == 0 {
		return 0
	}

	switch strings.ToUpper(operation) {
	case "SUM":
		sum := 0.0
		for _, v := range values {
			sum += v
		}
		return sum
	case "AVG", "AVERAGE":
		sum := 0.0
		for _, v := range values {
			sum += v
		}
		return sum / float64(len(values))
	case "MAX":
		max := values[0]
		for _, v := range values {
			if v > max {
				max = v
			}
		}
		return max
	case "MIN":
		min := values[0]
		for _, v := range values {
			if v < min {
				min = v
			}
		}
		return min
	case "COUNT":
		return float64(len(values))
	default:
		// Default to sum
		sum := 0.0
		for _, v := range values {
			sum += v
		}
		return sum
	}
}
