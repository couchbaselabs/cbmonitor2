// Package promqlbuilder constructs PromQL selectors for the snapshot metrics
// APIs when those APIs are backed by Mimir/Prometheus. It is intentionally
// small: a selector builder and a step parser. PromQL escape rules differ
// from SQL++, so this lives in its own package away from pkg/querybuilder.
package promqlbuilder

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/prometheus/common/model"
)

// DefaultStep is used when a request omits ?step= on the Prometheus path.
const DefaultStep = 15 * time.Second

// BuildSelector returns a PromQL selector of the form
//
//	metric{job="<snapshotID>",k1="v1",k2="v2"}
//
// Every entry in labelFilters becomes a plain equality matcher. Label
// names are sorted so the output is deterministic for tests. The
// snapshot ID is always emitted as the job label.
func BuildSelector(metricName, snapshotID string, labelFilters map[string]string) (string, error) {
	if metricName == "" {
		return "", fmt.Errorf("metricName is required")
	}
	if snapshotID == "" {
		return "", fmt.Errorf("snapshotID is required")
	}

	matchers := make([]string, 0, len(labelFilters)+1)
	matchers = append(matchers, fmt.Sprintf(`job=%s`, quoteValue(snapshotID)))

	names := make([]string, 0, len(labelFilters))
	for name := range labelFilters {
		if name == "" || name == "job" {
			// Skip empty keys and don't let callers override the job
			// matcher that pins the snapshot.
			continue
		}
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		matchers = append(matchers, fmt.Sprintf(`%s=%s`, name, quoteValue(labelFilters[name])))
	}

	return fmt.Sprintf("%s{%s}", metricName, strings.Join(matchers, ",")), nil
}

// ParseStep parses a Prometheus duration token (e.g. "15s", "1m", "1h30m",
// "500ms"). Empty input is rejected; callers should apply DefaultStep
// before calling.
func ParseStep(s string) (time.Duration, error) {
	if s == "" {
		return 0, fmt.Errorf("step is empty")
	}
	d, err := model.ParseDuration(s)
	if err != nil {
		return 0, fmt.Errorf("invalid step %q: %w", s, err)
	}
	if d <= 0 {
		return 0, fmt.Errorf("step must be positive, got %s", s)
	}
	return time.Duration(d), nil
}

// quoteValue escapes a label value per the PromQL grammar:
// backslash, double-quote, and newline are backslash-escaped, then the
// whole thing is wrapped in double quotes.
func quoteValue(v string) string {
	var b strings.Builder
	b.Grow(len(v) + 2)
	b.WriteByte('"')
	for _, r := range v {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '"':
			b.WriteString(`\"`)
		case '\n':
			b.WriteString(`\n`)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String()
}
