package promql

import (
	"context"
	"fmt"
	"time"

	"github.com/prometheus/prometheus/promql/parser"
)

// ParseQuery parses a PromQL query string into an AST
func ParseQuery(query string) (parser.Expr, error) {
	expr, err := parser.ParseExpr(query)
	if err != nil {
		return nil, fmt.Errorf("failed to parse PromQL query: %w", err)
	}
	return expr, nil
}

// QueryContext holds context for query execution
type QueryContext struct {
	Context    context.Context
	Query      string
	Time       time.Time
	StartTime  time.Time
	EndTime    time.Time
	Step       time.Duration
	IsRange    bool
	SnapshotID string // Optional snapshot ID from context
}

// ParseQueryContext parses query parameters into a QueryContext
func ParseQueryContext(query string, timeStr string, startStr, endStr string, stepStr string, snapshotID string) (*QueryContext, error) {
	ctx := &QueryContext{
		Query:      query,
		SnapshotID: snapshotID,
	}

	// Parse time (for instant queries)
	if timeStr != "" {
		t, err := parseTime(timeStr)
		if err != nil {
			return nil, fmt.Errorf("invalid time parameter: %w", err)
		}
		ctx.Time = t
		ctx.IsRange = false
	}

	// Parse time range (for range queries)
	if startStr != "" && endStr != "" {
		start, err := parseTime(startStr)
		if err != nil {
			return nil, fmt.Errorf("invalid start time: %w", err)
		}
		end, err := parseTime(endStr)
		if err != nil {
			return nil, fmt.Errorf("invalid end time: %w", err)
		}
		ctx.StartTime = start
		ctx.EndTime = end
		ctx.IsRange = true
		ctx.Time = end // Use end time as the evaluation time
	}

	// Parse step (for range queries)
	if stepStr != "" {
		step, err := parseDuration(stepStr)
		if err != nil {
			return nil, fmt.Errorf("invalid step parameter: %w", err)
		}
		ctx.Step = step
	}

	// Default to current time if no time specified
	if ctx.Time.IsZero() {
		ctx.Time = time.Now()
	}

	return ctx, nil
}

// parseTime parses a time string (Unix timestamp or RFC3339)
func parseTime(timeStr string) (time.Time, error) {
	// Try Unix timestamp first
	if timestamp, err := parseFloat(timeStr); err == nil {
		// Check if it's in seconds or milliseconds
		if timestamp > 1e10 {
			// Likely milliseconds
			return time.Unix(0, int64(timestamp*1e6)), nil
		}
		return time.Unix(int64(timestamp), 0), nil
	}

	// Try RFC3339
	if t, err := time.Parse(time.RFC3339, timeStr); err == nil {
		return t, nil
	}

	return time.Time{}, fmt.Errorf("unable to parse time: %s", timeStr)
}

// parseDuration parses a duration string (e.g., "5m", "1h", "30s")
func parseDuration(durationStr string) (time.Duration, error) {
	return time.ParseDuration(durationStr)
}

// parseFloat is a simple float parser
func parseFloat(s string) (float64, error) {
	var result float64
	_, err := fmt.Sscanf(s, "%f", &result)
	return result, err
}
