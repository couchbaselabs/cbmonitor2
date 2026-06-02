package promql

import (
	"strings"
	"testing"
)

// TestTranslateSmoke proves the relocated PromQL->SQL++ translator compiles
// and runs end-to-end (parse -> plan -> SQL) inside the gateway module. Full
// subset coverage and correctness are hardened in a later task (G7/G8).
func TestTranslateSmoke(t *testing.T) {
	cases := []struct {
		name      string
		query     string
		wantInSQL []string
	}{
		{
			name:      "vector selector with job",
			query:     `kv_curr_items{job="snap-1"}`,
			wantInSQL: []string{"kv_curr_items", "snap-1"},
		},
		{
			name:      "aggregation over rate",
			query:     `sum by (instance) (rate(kv_ops{job="snap-1",bucket="default"}[5m]))`,
			wantInSQL: []string{"kv_ops"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx, err := ParseQueryContext(tc.query, "", "1700000000", "1700003600", "15s", "")
			if err != nil {
				t.Fatalf("ParseQueryContext: %v", err)
			}

			expr, err := ParseQuery(tc.query)
			if err != nil {
				t.Fatalf("ParseQuery: %v", err)
			}

			plan, err := PlanQuery(expr, "")
			if err != nil {
				t.Fatalf("PlanQuery: %v", err)
			}
			if len(plan.SeriesQueries) == 0 {
				t.Fatalf("expected at least one series query, got plan: %s", plan.String())
			}

			queries, err := NewSQLBuilder(plan, ctx).Build()
			if err != nil {
				t.Fatalf("Build: %v", err)
			}
			if len(queries) == 0 {
				t.Fatal("expected at least one SQL++ query")
			}
			sql := strings.Join(queries, " ")
			for _, want := range tc.wantInSQL {
				if !strings.Contains(sql, want) {
					t.Errorf("generated SQL missing %q\nSQL: %s", want, sql)
				}
			}
		})
	}
}

// TestExtractJobAsSnapshot verifies the `job` label is mapped to the snapshot
// the generated SQL filters on.
func TestExtractJobAsSnapshot(t *testing.T) {
	expr, err := ParseQuery(`kv_ops{job="snap-42"}`)
	if err != nil {
		t.Fatalf("ParseQuery: %v", err)
	}
	plan, err := PlanQuery(expr, "")
	if err != nil {
		t.Fatalf("PlanQuery: %v", err)
	}
	if len(plan.SeriesQueries) != 1 {
		t.Fatalf("expected 1 series query, got %d", len(plan.SeriesQueries))
	}
	if got := plan.SeriesQueries[0].Snapshot; got != "snap-42" {
		t.Errorf("snapshot = %q, want %q", got, "snap-42")
	}
	if got := plan.SeriesQueries[0].MetricName; got != "kv_ops" {
		t.Errorf("metric = %q, want %q", got, "kv_ops")
	}
}
