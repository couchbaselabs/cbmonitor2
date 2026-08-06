// Package querybuilder holds the SQL++ label-filter clause shared by the
// Couchbase evaluator's selector translation.
//
// Label values never reach the statement text: they are bound as named
// parameters so no value can alter the query's structure. Label names, which
// are path expressions and cannot be parameterised, are validated against the
// Prometheus label-name grammar and rejected otherwise.
package querybuilder

import (
	"fmt"
	"regexp"
	"strings"
)

// labelNameRe is the Prometheus label-name grammar. PromQL's quoted-label
// syntax allows arbitrary UTF-8 names, so this is enforced rather than assumed:
// a name outside this set would have to be interpolated into the statement and
// could otherwise escape its backtick quoting.
var labelNameRe = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

// LabelFilter represents a label filter condition
type LabelFilter struct {
	Name  string
	Value string
	Op    string // "=", "!=", "=~", "!~"
}

// Params accumulates named query parameters for a single statement, handing
// out the placeholder to interpolate in the statement's place.
type Params struct {
	values map[string]interface{}
}

// NewParams returns an empty parameter set.
func NewParams() *Params {
	return &Params{values: map[string]interface{}{}}
}

// Add binds v and returns its placeholder (e.g. "$p0").
func (p *Params) Add(v interface{}) string {
	name := fmt.Sprintf("p%d", len(p.values))
	p.values[name] = v
	return "$" + name
}

// Values returns the bound parameters, keyed by name without the "$" prefix,
// as gocb's NamedParameters expects.
func (p *Params) Values() map[string]interface{} {
	return p.values
}

// BuildLabelWhereClauseFromFilters builds a WHERE clause from a LabelFilter
// slice, binding every value into params. Supports =, !=, =~ and !~.
//
// A label that is absent from a stored document reads as MISSING in SQL++,
// which would drop the row from any comparison; PromQL instead treats an
// absent label as the empty string. Each label is therefore coerced with
// TO_STRING (stored numeric labels compare as text) and defaulted to "", so
// negative and empty-value matchers select the same series they would on the Prometheus path.
func BuildLabelWhereClauseFromFilters(filters []LabelFilter, params *Params) (string, error) {
	if len(filters) == 0 {
		return "", nil
	}

	conditions := []string{}
	for _, filter := range filters {
		labelExpr, err := LabelExpr(filter.Name)
		if err != nil {
			return "", err
		}

		var condition string
		switch filter.Op {
		case "!=":
			condition = fmt.Sprintf(`%s != %s`, labelExpr, params.Add(filter.Value))
		case "=~":
			// PromQL =~ is a full-string regex match, not a SQL glob.
			condition = fmt.Sprintf(`REGEXP_MATCHES(%s, %s)`, labelExpr, params.Add(anchorRegex(filter.Value)))
		case "!~":
			condition = fmt.Sprintf(`NOT REGEXP_MATCHES(%s, %s)`, labelExpr, params.Add(anchorRegex(filter.Value)))
		default: // "="
			condition = fmt.Sprintf(`%s = %s`, labelExpr, params.Add(filter.Value))
		}
		conditions = append(conditions, condition)
	}

	return strings.Join(conditions, " AND "), nil
}

// LabelExpr returns the SQL++ expression for reading a label as a string, defaulting an absent
// label to "". The name is validated because it cannot be bound as a parameter.
func LabelExpr(label string) (string, error) {
	if !labelNameRe.MatchString(label) {
		return "", fmt.Errorf("unsupported label name %q: must match %s", label, labelNameRe)
	}
	return fmt.Sprintf("IFMISSINGORNULL(TO_STRING(d.labels.`%s`), '')", label), nil
}

// anchorRegex makes a PromQL matcher's regex full-string, matching Prometheus
// semantics.
func anchorRegex(value string) string {
	return "^(" + value + ")$"
}
