package api

import (
	"testing"

	"github.com/couchbase/config-manager/internal/models"
)

func TestCollectProducts(t *testing.T) {
	cases := []struct {
		name    string
		configs []models.ConfigObject
		want    []string
	}{
		{
			name:    "blank products are skipped",
			configs: []models.ConfigObject{{Product: ""}, {Product: "couchbase"}},
			want:    []string{"couchbase"},
		},
		{
			name:    "order follows the configs, deduped",
			configs: []models.ConfigObject{{Product: "couchbase"}, {Product: "syncgateway"}, {Product: "couchbase"}},
			want:    []string{"couchbase", "syncgateway"},
		},
		{
			name:    "appservice implies syncgateway",
			configs: []models.ConfigObject{{Product: "couchbase"}, {Product: "appservice"}},
			want:    []string{"couchbase", "appservice", "syncgateway"},
		},
		{
			name:    "an implied product already present is not repeated",
			configs: []models.ConfigObject{{Product: "syncgateway"}, {Product: "appservice"}},
			want:    []string{"syncgateway", "appservice"},
		},
		{
			name:    "unregistered products pass through as-is",
			configs: []models.ConfigObject{{Product: "kafka"}},
			want:    []string{"kafka"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := collectProducts(tc.configs)
			if len(got) != len(tc.want) {
				t.Fatalf("collectProducts = %v, want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("collectProducts = %v, want %v", got, tc.want)
				}
			}
		})
	}
}
