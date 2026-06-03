package promql

import (
	"strings"
	"testing"
)

func translateOne(t *testing.T, query string, ctx *QueryContext) string {
	t.Helper()
	expr, err := ParseQuery(query)
	if err != nil {
		t.Fatalf("ParseQuery(%q): %v", query, err)
	}
	plan, err := PlanQuery(expr, "")
	if err != nil {
		t.Fatalf("PlanQuery: %v", err)
	}
	queries, err := NewSQLBuilder(plan, ctx).Build()
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if len(queries) != 1 {
		t.Fatalf("expected 1 query, got %d: %v", len(queries), queries)
	}
	return queries[0]
}

// rangeCtx is a 1h range-query context [1700000000, 1700003600] (Unix seconds).
func rangeCtx(keyspace string) *QueryContext {
	c, err := ParseQueryContext("", "", "1700000000", "1700003600", "15s", "")
	if err != nil {
		panic(err)
	}
	c.Keyspace = keyspace
	return c
}

func mustContainAll(t *testing.T, sql string, wants ...string) {
	t.Helper()
	for _, w := range wants {
		if !strings.Contains(sql, w) {
			t.Errorf("SQL missing %q\nSQL: %s", w, sql)
		}
	}
}

func mustNotContain(t *testing.T, sql string, notWants ...string) {
	t.Helper()
	for _, w := range notWants {
		if strings.Contains(sql, w) {
			t.Errorf("SQL unexpectedly contains %q\nSQL: %s", w, sql)
		}
	}
}

func TestBuildSelectorWithJobAndWindow(t *testing.T) {
	sql := translateOne(t, `kv_curr_items{job="snap-1"}`, rangeCtx("bkt.scp.col"))
	mustContainAll(t, sql,
		"FROM bkt.scp.col AS d",
		"d.metric_name = 'kv_curr_items'",
		"d.labels.`job` = 'snap-1'",
		"_timeseries(d, {'ts_ranges':[1700000000000, 1700003600000]})",
		"MILLIS_TO_STR(t._t) AS time",
		"t._v0 AS `value`",
		"d.labels AS labels",
	)
}

func TestBuildDefaultKeyspace(t *testing.T) {
	sql := translateOne(t, `up{job="s"}`, rangeCtx(""))
	mustContainAll(t, sql, "FROM cbmonitor._default._default AS d")
}

func TestBuildLabelMatchers(t *testing.T) {
	sql := translateOne(t, `kv_ops{job="s",proc="memcached",mode!="idle"}`, rangeCtx("k"))
	mustContainAll(t, sql,
		"d.labels.`proc` = 'memcached'",
		"d.labels.`mode` != 'idle'",
	)
}

func TestBuildRegexMatchers(t *testing.T) {
	sql := translateOne(t, `kv_ops{job="s",bucket=~"a.*",node!~"x.*"}`, rangeCtx("k"))
	mustContainAll(t, sql,
		"REGEXP_MATCHES(d.labels.`bucket`, '^(a.*)$')",
		"NOT REGEXP_MATCHES(d.labels.`node`, '^(x.*)$')",
	)
	mustNotContain(t, sql, "LIKE")
}

func TestBuildRateHasNoSQLRate(t *testing.T) {
	// rate is computed in Go; the SQL is just the underlying selector.
	sql := translateOne(t, `rate(kv_ops{job="s"}[5m])`, rangeCtx("k"))
	mustContainAll(t, sql, "d.metric_name = 'kv_ops'")
	mustNotContain(t, sql, "rate(", "RATE(")
}

func TestBuildAggregationHasNoSQLGroupBy(t *testing.T) {
	// aggregation is computed in Go; the SQL is just the underlying selector.
	sql := translateOne(t, `sum by (instance) (kv_ops{job="s"})`, rangeCtx("k"))
	mustContainAll(t, sql, "d.metric_name = 'kv_ops'")
	mustNotContain(t, sql, "GROUP BY", "SUM(")
}

func TestBuildInstantQueryWindow(t *testing.T) {
	c, err := ParseQueryContext(`up{job="s"}`, "1700000000", "", "", "", "")
	if err != nil {
		t.Fatalf("ParseQueryContext: %v", err)
	}
	c.Keyspace = "k"
	sql := translateOne(t, `up{job="s"}`, c)
	// Instant query: window ends at the eval time (1700000000000) and looks
	// back instantLookback (5m = 300000ms) → [1699999700000, 1700000000000].
	mustContainAll(t, sql, "_timeseries(d, {'ts_ranges':[1699999700000, 1700000000000]})")
}

func TestPlannerByWithout(t *testing.T) {
	byExpr, err := ParseQuery(`sum by (instance) (up{job="s"})`)
	if err != nil {
		t.Fatalf("parse by: %v", err)
	}
	byPlan, err := PlanQuery(byExpr, "")
	if err != nil {
		t.Fatalf("plan by: %v", err)
	}
	if byPlan.Aggregation == nil || len(byPlan.Aggregation.By) != 1 || byPlan.Aggregation.By[0] != "instance" || len(byPlan.Aggregation.Without) != 0 {
		t.Errorf("by-plan = %+v, want By=[instance] Without=[]", byPlan.Aggregation)
	}

	withoutExpr, err := ParseQuery(`sum without (le) (up{job="s"})`)
	if err != nil {
		t.Fatalf("parse without: %v", err)
	}
	withoutPlan, err := PlanQuery(withoutExpr, "")
	if err != nil {
		t.Fatalf("plan without: %v", err)
	}
	if withoutPlan.Aggregation == nil || len(withoutPlan.Aggregation.Without) != 1 || withoutPlan.Aggregation.Without[0] != "le" || len(withoutPlan.Aggregation.By) != 0 {
		t.Errorf("without-plan = %+v, want Without=[le] By=[]", withoutPlan.Aggregation)
	}
}
