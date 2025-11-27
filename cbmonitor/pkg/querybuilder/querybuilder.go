package querybuilder

import (
	"fmt"
	"strings"
)

// LabelFilter represents a label filter condition
type LabelFilter struct {
	Name  string
	Value string
	Op    string // "=", "!=", "=~", "!~"
}

// BuildLabelWhereClause builds a WHERE clause for label filters
// Returns empty string if no filters, otherwise returns conditions joined with AND
func BuildLabelWhereClause(labelFilters map[string]string) string {
	if len(labelFilters) == 0 {
		return ""
	}

	conditions := []string{}
	for labelName, labelValue := range labelFilters {
		// Escape label name and value for SQL injection prevention
		escapedLabel := EscapeLabel(labelName)
		// Basic SQL injection prevention - escape single quotes in value
		escapedValue := strings.ReplaceAll(labelValue, "'", "''")
		conditions = append(conditions, fmt.Sprintf(`d.labels.%s = '%s'`, escapedLabel, escapedValue))
	}

	return strings.Join(conditions, " AND ")
}

// BuildLabelWhereClauseFromFilters builds a WHERE clause from LabelFilter slice
// Supports different operators: =, !=, =~, !~
func BuildLabelWhereClauseFromFilters(filters []LabelFilter) string {
	if len(filters) == 0 {
		return ""
	}

	conditions := []string{}
	for _, filter := range filters {
		escapedLabel := EscapeLabel(filter.Name)
		escapedValue := strings.ReplaceAll(filter.Value, "'", "''")

		var condition string
		switch filter.Op {
		case "!=":
			condition = fmt.Sprintf(`d.labels.%s != '%s'`, escapedLabel, escapedValue)
		case "=~":
			condition = fmt.Sprintf(`d.labels.%s LIKE '%s'`, escapedLabel, escapedValue)
		case "!~":
			condition = fmt.Sprintf(`d.labels.%s NOT LIKE '%s'`, escapedLabel, escapedValue)
		default: // "="
			condition = fmt.Sprintf(`d.labels.%s = '%s'`, escapedLabel, escapedValue)
		}
		conditions = append(conditions, condition)
	}

	return strings.Join(conditions, " AND ")
}

// EscapeLabel escapes label names for SQL++ by wrapping them in backticks
func EscapeLabel(label string) string {
	return fmt.Sprintf("`%s`", label)
}

// buildSelectClause builds a SELECT clause from field names, prefixing each with "d."
// Handles fields that may already have aliases (e.g., "time AS timestamp" -> "d.time AS timestamp")
func buildSelectClause(fields []string) string {
	if len(fields) == 0 {
		return "*"
	}

	selectParts := []string{}
	for _, field := range fields {
		field = strings.TrimSpace(field)
		if field == "" {
			continue
		}

		// Check if field already has "d." prefix
		if strings.HasPrefix(field, "d.") {
			selectParts = append(selectParts, field)
			continue
		}

		// Check if field has an alias (e.g., "time AS timestamp")
		if strings.Contains(strings.ToUpper(field), " AS ") {
			parts := strings.SplitN(field, " AS ", 2)
			if len(parts) == 2 {
				// Prefix the field name with d., keep the alias
				selectParts = append(selectParts, fmt.Sprintf("d.`%s` AS `%s`", strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])))
				continue
			}
		}

		// Simple field name - just prefix with d.
		selectParts = append(selectParts, fmt.Sprintf("d.`%s`", field))
	}

	return strings.Join(selectParts, ", ")
}

// BuildMetricQuery builds a query with label conditions embedded BEFORE UNNEST for optimal performance
// metricName: name of the metric
// labelConditions: WHERE clause conditions for label filtering (e.g., "d.labels.job = 'snapshot-1' AND d.labels.node = 'node1'")
// selectFields: list of fields to select (e.g., []string{"time", "value"} or []string{"value"})
// All label filters are embedded in the query to be applied BEFORE UNNEST for optimal performance
// Since SQL++ UDFs can't execute dynamic SQL from string parameters, we construct the query inline
func BuildMetricQuery(metricName, labelConditions string, selectFields []string) string {
	// Construct query with conditions embedded - this ensures filtering happens BEFORE UNNEST
	// This is more efficient than using a UDF with post-UNNEST filtering
	baseQuery := fmt.Sprintf(
		"SELECT t._t AS time_millis, MILLIS_TO_STR(t._t) AS time, t._v0 AS `value`, d.labels AS labels FROM cbmonitor._default._default AS d UNNEST _timeseries(d, {'ts_ranges':[0, 9223372036854775807]}) AS t WHERE d.metric_name = '%s'",
		metricName,
	)

	if labelConditions != "" {
		// Add label conditions - these filter BEFORE UNNEST for optimal performance
		baseQuery = fmt.Sprintf("%s AND %s", baseQuery, labelConditions)
	}

	// Build SELECT clause with d. prefix for each field
	selectClause := buildSelectClause(selectFields)

	// Wrap in outer SELECT to get only the requested fields
	return fmt.Sprintf("SELECT %s FROM (%s) AS d", selectClause, baseQuery)
}

// BuildSnapshotQuery builds a query with all label conditions embedded BEFORE UNNEST
// metricName: name of the metric
// snapshotID: snapshot/job identifier (always included as d.labels.job filter)
// selectFields: list of fields to select (e.g., []string{"time", "value"} or []string{"value"})
// additionalConditions: additional WHERE clause conditions for label filtering (beyond job)
// All filters are embedded to be applied BEFORE UNNEST for optimal performance
func BuildSnapshotQuery(metricName, snapshotID string, selectFields []string, additionalConditions string) string {
	// Build base query with job filter embedded before UNNEST
	baseQuery := fmt.Sprintf(
		"SELECT t._t AS time_millis, MILLIS_TO_STR(t._t) AS time, t._v0 AS `value`, d.labels AS labels FROM cbmonitor._default._default AS d UNNEST _timeseries(d, {'ts_ranges':[0, 9223372036854775807]}) AS t WHERE d.metric_name = '%s' AND d.labels.job = '%s'",
		metricName,
		snapshotID,
	)

	// Add additional label conditions if provided
	if additionalConditions != "" {
		baseQuery = fmt.Sprintf("%s AND %s", baseQuery, additionalConditions)
	}

	// Build SELECT clause with d. prefix for each field
	selectClause := buildSelectClause(selectFields)

	// Wrap to apply time filtering from snapshot metadata
	return fmt.Sprintf(
		"SELECT %s FROM (%s) AS d JOIN metadata._default._default AS s ON KEYS '%s' WHERE d.time_millis >= STR_TO_MILLIS(s.ts_start) AND d.time_millis <= STR_TO_MILLIS(s.ts_end)",
		selectClause,
		baseQuery,
		snapshotID,
	)
}

// BuildPhaseQuery builds a query with all label conditions embedded BEFORE UNNEST
// metricName: name of the metric
// snapshotID: snapshot/job identifier (always included as d.labels.job filter)
// phaseName: name of the phase
// selectFields: list of fields to select (e.g., []string{"time", "value"} or []string{"value"})
// additionalConditions: additional WHERE clause conditions for label filtering (beyond job)
// All filters are embedded to be applied BEFORE UNNEST for optimal performance
func BuildPhaseQuery(metricName, snapshotID, phaseName string, selectFields []string, additionalConditions string) string {
	// Build base query with job filter embedded before UNNEST
	baseQuery := fmt.Sprintf(
		"SELECT t._t AS time_millis, MILLIS_TO_STR(t._t) AS time, t._v0 AS `value`, d.labels AS labels FROM cbmonitor._default._default AS d UNNEST _timeseries(d, {'ts_ranges':[0, 9223372036854775807]}) AS t WHERE d.metric_name = '%s' AND d.labels.job = '%s'",
		metricName,
		snapshotID,
	)

	// Add additional label conditions if provided
	if additionalConditions != "" {
		baseQuery = fmt.Sprintf("%s AND %s", baseQuery, additionalConditions)
	}

	// Build SELECT clause with d. prefix for each field
	selectClause := buildSelectClause(selectFields)

	// Wrap to apply phase time filtering from snapshot metadata
	return fmt.Sprintf(
		"SELECT %s FROM (%s) AS d JOIN metadata._default._default AS s ON KEYS '%s' UNNEST s.phases AS p WHERE p.label = '%s' AND d.time_millis >= STR_TO_MILLIS(p.ts_start) AND d.time_millis <= STR_TO_MILLIS(p.ts_end)",
		selectClause,
		baseQuery,
		snapshotID,
		phaseName,
	)
}
