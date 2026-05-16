package promqlbuilder

import (
	"testing"
	"time"
)

func TestBuildSelector(t *testing.T) {
	tests := []struct {
		name         string
		metric       string
		snapshotID   string
		labelFilters map[string]string
		want         string
		wantErr      bool
	}{
		{
			name:       "no filters emits only job",
			metric:     "kv_ops",
			snapshotID: "snap-1",
			want:       `kv_ops{job="snap-1"}`,
		},
		{
			name:       "multiple labels sorted alphabetically",
			metric:     "kv_ops",
			snapshotID: "snap-1",
			labelFilters: map[string]string{
				"node":    "n1",
				"bucket":  "default",
				"cluster": "c1",
			},
			want: `kv_ops{job="snap-1",bucket="default",cluster="c1",node="n1"}`,
		},
		{
			name:       "callers cannot override job",
			metric:     "kv_ops",
			snapshotID: "snap-1",
			labelFilters: map[string]string{
				"job":  "hijack",
				"node": "n1",
			},
			want: `kv_ops{job="snap-1",node="n1"}`,
		},
		{
			name:       "empty key skipped",
			metric:     "kv_ops",
			snapshotID: "snap-1",
			labelFilters: map[string]string{
				"":     "garbage",
				"node": "n1",
			},
			want: `kv_ops{job="snap-1",node="n1"}`,
		},
		{
			name:       "special chars escaped",
			metric:     "kv_ops",
			snapshotID: "snap-1",
			labelFilters: map[string]string{
				"weird": "a\\b\"c\nd",
			},
			want: `kv_ops{job="snap-1",weird="a\\b\"c\nd"}`,
		},
		{
			name:       "snapshot id with quote escaped",
			metric:     "kv_ops",
			snapshotID: `snap"1`,
			want:       `kv_ops{job="snap\"1"}`,
		},
		{
			name:    "missing metric is an error",
			metric:  "",
			snapshotID: "snap-1",
			wantErr: true,
		},
		{
			name:       "missing snapshot is an error",
			metric:     "kv_ops",
			snapshotID: "",
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := BuildSelector(tt.metric, tt.snapshotID, tt.labelFilters)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil; result=%q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("BuildSelector() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestParseStep(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    time.Duration
		wantErr bool
	}{
		{name: "15s", in: "15s", want: 15 * time.Second},
		{name: "1m", in: "1m", want: 1 * time.Minute},
		{name: "1h30m", in: "1h30m", want: 90 * time.Minute},
		{name: "500ms", in: "500ms", want: 500 * time.Millisecond},
		{name: "empty rejected", in: "", wantErr: true},
		{name: "no unit rejected", in: "15", wantErr: true},
		{name: "garbage rejected", in: "garbage", wantErr: true},
		{name: "trailing junk rejected", in: "15s nope", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseStep(tt.in)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil; got=%s", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("ParseStep(%q) = %s, want %s", tt.in, got, tt.want)
			}
		})
	}
}
