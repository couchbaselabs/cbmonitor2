// Package querybuilder holds the SQL++ label-filter clause shared by the
// Couchbase evaluator's selector translation.
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
			// PromQL =~ is a full-string regex match, not a SQL glob.
			condition = fmt.Sprintf(`REGEXP_MATCHES(d.labels.%s, '^(%s)$')`, escapedLabel, escapedValue)
		case "!~":
			condition = fmt.Sprintf(`NOT REGEXP_MATCHES(d.labels.%s, '^(%s)$')`, escapedLabel, escapedValue)
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
