package cbeval

import (
	"context"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/prometheus/prometheus/model/labels"
)

var base = time.Unix(1700000000, 0).UTC()

// fakeRowQuerier returns canned rows regardless of the SQL — the test controls
// the dataset and the query so the returned rows are exactly the series the
// engine should evaluate.
type fakeRowQuerier struct {
	rows    []map[string]interface{}
	lastSQL string
}

func (f *fakeRowQuerier) ExecuteQuery(_ context.Context, sql string) ([]map[string]interface{}, error) {
	f.lastSQL = sql
	return f.rows, nil
}

// counterRows builds samples for one series: value = offsetSeconds * slope,
// every 15s for the given count, so a slope of 1 yields a 1/s counter.
func counterRows(job, instance string, count int, slope float64) []map[string]interface{} {
	rows := make([]map[string]interface{}, 0, count)
	for i := 0; i < count; i++ {
		offset := i * 15
		rows = append(rows, map[string]interface{}{
			"time":   base.Add(time.Duration(offset) * time.Second).Format(time.RFC3339),
			"value":  float64(offset) * slope,
			"labels": map[string]interface{}{"job": job, "instance": instance},
		})
	}
	return rows
}

func TestRangeQueryRate(t *testing.T) {
	// One linear counter (value == seconds) → rate == 1/s.
	q := &fakeRowQuerier{rows: counterRows("s", "n1", 14, 1)}
	e := NewEvaluator(q, "k")

	res, err := e.RangeQuery(context.Background(),
		`rate(c{job="s"}[1m])`,
		base.Add(60*time.Second), base.Add(180*time.Second), 30*time.Second)
	if err != nil {
		t.Fatalf("RangeQuery: %v", err)
	}
	if res.Data.ResultType != "matrix" {
		t.Fatalf("resultType = %q, want matrix", res.Data.ResultType)
	}
	if len(res.Data.Result) != 1 {
		t.Fatalf("got %d series, want 1", len(res.Data.Result))
	}
	pts := res.Data.Result[0].Values
	if len(pts) == 0 {
		t.Fatal("no points in rate series")
	}
	for _, p := range pts {
		v, err := strconv.ParseFloat(p[1].(string), 64)
		if err != nil {
			t.Fatalf("parse value %v: %v", p[1], err)
		}
		if v < 0.8 || v > 1.2 {
			t.Errorf("rate = %v, want ~1.0 (per-second)", v)
		}
	}
}

func TestRangeQueryAggregation(t *testing.T) {
	// Two instances; sum by(job) collapses them into one series.
	rows := append(counterRows("s", "n1", 14, 1), counterRows("s", "n2", 14, 2)...)
	q := &fakeRowQuerier{rows: rows}
	e := NewEvaluator(q, "k")

	res, err := e.RangeQuery(context.Background(),
		`sum by (job) (c{job="s"})`,
		base.Add(60*time.Second), base.Add(180*time.Second), 30*time.Second)
	if err != nil {
		t.Fatalf("RangeQuery: %v", err)
	}
	if len(res.Data.Result) != 1 {
		t.Fatalf("got %d series, want 1 (grouped by job)", len(res.Data.Result))
	}
	metric := res.Data.Result[0].Metric
	if len(metric) != 1 || metric["job"] != "s" {
		t.Errorf("metric = %v, want {job: s}", metric)
	}
	// At the last step (base+180s) the latest samples are n1=180, n2=360 → 540.
	pts := res.Data.Result[0].Values
	last := pts[len(pts)-1]
	v, err := strconv.ParseFloat(last[1].(string), 64)
	if err != nil {
		t.Fatalf("parse last value: %v", err)
	}
	if v < 539 || v > 541 {
		t.Errorf("last sum = %v, want ~540", v)
	}
}

func TestBuildSelectorSQL(t *testing.T) {
	mk := func(typ labels.MatchType, n, v string) *labels.Matcher {
		m, err := labels.NewMatcher(typ, n, v)
		if err != nil {
			t.Fatalf("matcher: %v", err)
		}
		return m
	}
	matchers := []*labels.Matcher{
		mk(labels.MatchEqual, labels.MetricName, "kv_ops"),
		mk(labels.MatchEqual, "job", "snap-1"),
		mk(labels.MatchRegexp, "bucket", "a.*"),
		mk(labels.MatchNotEqual, "mode", "idle"),
	}
	sql, err := buildSelectorSQL(matchers, "bkt.scp.col", 1000, 2000)
	if err != nil {
		t.Fatalf("buildSelectorSQL: %v", err)
	}
	for _, want := range []string{
		"FROM bkt.scp.col AS d",
		"d.metric_name = 'kv_ops'",
		"d.labels.`job` = 'snap-1'",
		"REGEXP_MATCHES(d.labels.`bucket`, '^(a.*)$')",
		"d.labels.`mode` != 'idle'",
		"_timeseries(d, {'ts_ranges':[1000, 2000]})",
	} {
		if !strings.Contains(sql, want) {
			t.Errorf("SQL missing %q\nSQL: %s", want, sql)
		}
	}
}

func TestBuildSelectorSQLRequiresMetricName(t *testing.T) {
	m, _ := labels.NewMatcher(labels.MatchEqual, "job", "s")
	if _, err := buildSelectorSQL([]*labels.Matcher{m}, "k", 0, 1); err == nil {
		t.Error("expected an error when no metric name is present")
	}
}
