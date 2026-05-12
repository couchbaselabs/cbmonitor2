package plugin

import (
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestLoadSettings_AllDisabledDefault(t *testing.T) {
	s, err := LoadSettings(backend.AppInstanceSettings{})
	if err != nil {
		t.Fatalf("LoadSettings on empty input should succeed, got: %v", err)
	}
	if s.Snapshots.Enabled || s.CouchbaseDatasource.Enabled {
		t.Errorf("default settings should leave Couchbase-backed features off, got snapshots=%v cb=%v", s.Snapshots.Enabled, s.CouchbaseDatasource.Enabled)
	}
	if !s.PrometheusDatasource.Enabled {
		t.Errorf("default settings should leave Prometheus on for first-run usability")
	}
}

func TestLoadSettings_HappyPath(t *testing.T) {
	jsonData := []byte(`{
		"couchbaseServer": {"connectionString": "couchbase://cb-1", "username": "admin"},
		"snapshots": {"enabled": true, "bucket": "metadata"},
		"couchbaseDatasource": {"enabled": true, "bucket": "showfast"},
		"prometheusDatasource": {"enabled": true, "isDefault": false}
	}`)
	s, err := LoadSettings(backend.AppInstanceSettings{
		JSONData: jsonData,
		DecryptedSecureJSONData: map[string]string{
			secureFieldCouchbasePassword: "s3cret",
		},
	})
	if err != nil {
		t.Fatalf("LoadSettings: %v", err)
	}
	if s.CouchbaseServer.ConnectionString != "couchbase://cb-1" {
		t.Errorf("connectionString not parsed, got %q", s.CouchbaseServer.ConnectionString)
	}
	if s.CouchbaseServer.Password != "s3cret" {
		t.Errorf("password not loaded from secureJsonData, got %q", s.CouchbaseServer.Password)
	}
	if s.Snapshots.Bucket != "metadata" {
		t.Errorf("snapshots.bucket parsing wrong, got %q", s.Snapshots.Bucket)
	}
	if s.PrometheusDatasource.IsDefault {
		t.Errorf("isDefault should reflect input (false)")
	}
}

func TestLoadSettings_RequiresServerWhenFeatureEnabled(t *testing.T) {
	jsonData := []byte(`{
		"snapshots": {"enabled": true, "bucket": "metadata"}
	}`)
	if _, err := LoadSettings(backend.AppInstanceSettings{JSONData: jsonData}); err == nil {
		t.Fatalf("expected error when snapshots enabled without couchbase server")
	}
}

func TestLoadSettings_RequiresBucketWhenFeatureEnabled(t *testing.T) {
	jsonData := []byte(`{
		"couchbaseServer": {"connectionString": "couchbase://cb-1", "username": "admin"},
		"couchbaseDatasource": {"enabled": true}
	}`)
	if _, err := LoadSettings(backend.AppInstanceSettings{JSONData: jsonData}); err == nil {
		t.Fatalf("expected error when couchbase datasource enabled without bucket")
	}
}

func TestDefaultDataSource(t *testing.T) {
	cases := []struct {
		name string
		s    PluginSettings
		want string
	}{
		{
			name: "prom default on, both enabled",
			s: PluginSettings{
				PrometheusDatasource: PrometheusDatasourceSettings{Enabled: true, IsDefault: true},
				CouchbaseDatasource:  CouchbaseDatasourceSettings{Enabled: true, Bucket: "showfast"},
				CouchbaseServer:      CouchbaseServerSettings{ConnectionString: "couchbase://x", Username: "u"},
			},
			want: "prometheus",
		},
		{
			name: "couchbase default on, both enabled",
			s: PluginSettings{
				PrometheusDatasource: PrometheusDatasourceSettings{Enabled: true, IsDefault: false},
				CouchbaseDatasource:  CouchbaseDatasourceSettings{Enabled: true, Bucket: "showfast"},
				CouchbaseServer:      CouchbaseServerSettings{ConnectionString: "couchbase://x", Username: "u"},
			},
			want: "couchbase",
		},
		{
			name: "only couchbase enabled",
			s: PluginSettings{
				PrometheusDatasource: PrometheusDatasourceSettings{Enabled: false, IsDefault: true},
				CouchbaseDatasource:  CouchbaseDatasourceSettings{Enabled: true, Bucket: "showfast"},
				CouchbaseServer:      CouchbaseServerSettings{ConnectionString: "couchbase://x", Username: "u"},
			},
			want: "couchbase",
		},
		{
			name: "neither enabled falls back to prometheus",
			s:    PluginSettings{},
			want: "prometheus",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.s.DefaultDataSource(); got != tc.want {
				t.Errorf("DefaultDataSource = %q, want %q", got, tc.want)
			}
		})
	}
}
