package querybuilder

import "testing"

func TestBuildLabelWhereClauseFromFilters(t *testing.T) {
	cases := []struct {
		name    string
		filters []LabelFilter
		want    string
	}{
		{
			name:    "empty",
			filters: nil,
			want:    "",
		},
		{
			name:    "equality",
			filters: []LabelFilter{{Name: "job", Value: "snap-1", Op: "="}},
			want:    "d.labels.`job` = 'snap-1'",
		},
		{
			name:    "negation",
			filters: []LabelFilter{{Name: "bucket", Value: "default", Op: "!="}},
			want:    "d.labels.`bucket` != 'default'",
		},
		{
			name:    "regex is anchored full-string",
			filters: []LabelFilter{{Name: "instance", Value: "n1|n2", Op: "=~"}},
			want:    "REGEXP_MATCHES(d.labels.`instance`, '^(n1|n2)$')",
		},
		{
			name:    "negative regex",
			filters: []LabelFilter{{Name: "instance", Value: "n1", Op: "!~"}},
			want:    "NOT REGEXP_MATCHES(d.labels.`instance`, '^(n1)$')",
		},
		{
			name: "multiple joined with AND",
			filters: []LabelFilter{
				{Name: "job", Value: "snap-1", Op: "="},
				{Name: "bucket", Value: "default", Op: "="},
			},
			want: "d.labels.`job` = 'snap-1' AND d.labels.`bucket` = 'default'",
		},
		{
			name:    "single quotes escaped",
			filters: []LabelFilter{{Name: "job", Value: "o'brien", Op: "="}},
			want:    "d.labels.`job` = 'o''brien'",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := BuildLabelWhereClauseFromFilters(c.filters); got != c.want {
				t.Errorf("got %q, want %q", got, c.want)
			}
		})
	}
}

func TestEscapeLabel(t *testing.T) {
	if got := EscapeLabel("instance"); got != "`instance`" {
		t.Errorf("got %q", got)
	}
}
