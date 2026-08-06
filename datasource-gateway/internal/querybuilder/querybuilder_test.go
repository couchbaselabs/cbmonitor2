package querybuilder

import (
	"strings"
	"testing"
)

func TestBuildLabelWhereClauseFromFilters(t *testing.T) {
	// Every label read is coerced to a string and defaulted to "", so PromQL's
	// "absent label == empty string" semantics hold on the Couchbase path too.
	const jobExpr = "IFMISSINGORNULL(TO_STRING(d.labels.`job`), '')"
	const instExpr = "IFMISSINGORNULL(TO_STRING(d.labels.`instance`), '')"

	cases := []struct {
		name       string
		filters    []LabelFilter
		want       string
		wantParams map[string]interface{}
	}{
		{
			name:       "empty",
			filters:    nil,
			want:       "",
			wantParams: map[string]interface{}{},
		},
		{
			name:       "equality binds the value",
			filters:    []LabelFilter{{Name: "job", Value: "snap-1", Op: "="}},
			want:       jobExpr + " = $p0",
			wantParams: map[string]interface{}{"p0": "snap-1"},
		},
		{
			name:       "negation binds the value",
			filters:    []LabelFilter{{Name: "job", Value: "default", Op: "!="}},
			want:       jobExpr + " != $p0",
			wantParams: map[string]interface{}{"p0": "default"},
		},
		{
			name:       "regex is anchored full-string and bound",
			filters:    []LabelFilter{{Name: "instance", Value: "n1|n2", Op: "=~"}},
			want:       "REGEXP_MATCHES(" + instExpr + ", $p0)",
			wantParams: map[string]interface{}{"p0": "^(n1|n2)$"},
		},
		{
			name:       "negative regex",
			filters:    []LabelFilter{{Name: "instance", Value: "n1", Op: "!~"}},
			want:       "NOT REGEXP_MATCHES(" + instExpr + ", $p0)",
			wantParams: map[string]interface{}{"p0": "^(n1)$"},
		},
		{
			name: "multiple joined with AND, each parameterised",
			filters: []LabelFilter{
				{Name: "job", Value: "snap-1", Op: "="},
				{Name: "instance", Value: "n1", Op: "="},
			},
			want:       jobExpr + " = $p0 AND " + instExpr + " = $p1",
			wantParams: map[string]interface{}{"p0": "snap-1", "p1": "n1"},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := NewParams()
			got, err := BuildLabelWhereClauseFromFilters(c.filters, p)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != c.want {
				t.Errorf("clause:\n got %q\nwant %q", got, c.want)
			}
			if len(p.Values()) != len(c.wantParams) {
				t.Fatalf("params = %v, want %v", p.Values(), c.wantParams)
			}
			for k, v := range c.wantParams {
				if p.Values()[k] != v {
					t.Errorf("param %s = %v, want %v", k, p.Values()[k], v)
				}
			}
		})
	}
}

// A value can't alter the statement: quotes, backslashes and SQL fragments all
// travel as bound parameters, so the clause text is identical to a plain value's.
func TestValuesAreNeverInterpolated(t *testing.T) {
	hostile := []string{
		`o'brien`,
		`h1\`,
		`x' OR 1=1 --`,
		`'; SELECT * FROM system:keyspaces; --`,
	}
	for _, v := range hostile {
		p := NewParams()
		got, err := BuildLabelWhereClauseFromFilters([]LabelFilter{{Name: "job", Value: v, Op: "="}}, p)
		if err != nil {
			t.Fatalf("unexpected error for %q: %v", v, err)
		}
		if want := "IFMISSINGORNULL(TO_STRING(d.labels.`job`), '') = $p0"; got != want {
			t.Errorf("value %q leaked into the clause: %q", v, got)
		}
		if p.Values()["p0"] != v {
			t.Errorf("value %q not bound verbatim: %v", v, p.Values()["p0"])
		}
	}
}

// Label names are path expressions and can't be parameterised, so a name that
// could break out of its backtick quoting is rejected rather than interpolated.
func TestLabelExprRejectsUnsafeNames(t *testing.T) {
	unsafe := []string{
		"a` = 'x' OR 1=1 OR d.labels.`b",
		"has space",
		"has-dash",
		"1leading_digit",
		"",
		"back`tick",
	}
	for _, name := range unsafe {
		if _, err := LabelExpr(name); err == nil {
			t.Errorf("label name %q was accepted, want rejection", name)
		}
	}

	for _, name := range []string{"job", "instance", "_internal", "a1_b2", "__name__"} {
		got, err := LabelExpr(name)
		if err != nil {
			t.Errorf("label name %q rejected: %v", name, err)
			continue
		}
		if !strings.Contains(got, "`"+name+"`") {
			t.Errorf("expr for %q = %q", name, got)
		}
	}
}

func TestBuildLabelWhereClauseRejectsUnsafeLabelName(t *testing.T) {
	p := NewParams()
	if _, err := BuildLabelWhereClauseFromFilters(
		[]LabelFilter{{Name: "a` OR 1=1 OR `b", Value: "x", Op: "="}}, p); err == nil {
		t.Fatal("expected an error for an unsafe label name")
	}
}
