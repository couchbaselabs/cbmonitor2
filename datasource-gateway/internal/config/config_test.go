package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfigDefaults(t *testing.T) {
	cfg, err := LoadConfig("", nil)
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.Server.Port != 8090 {
		t.Errorf("Server.Port = %d, want 8090", cfg.Server.Port)
	}
	if cfg.Prometheus.URL != "http://localhost:9009/prometheus" {
		t.Errorf("Prometheus.URL = %q", cfg.Prometheus.URL)
	}
	if !cfg.Couchbase.Enabled {
		t.Error("Couchbase.Enabled should default to true")
	}
	if cfg.Couchbase.MetricsBucket != "cbmonitor" {
		t.Errorf("Couchbase.MetricsBucket = %q", cfg.Couchbase.MetricsBucket)
	}
}

func TestLoadConfigFileOverridesDefaults(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	content := `
server:
  port: 9999
prometheus:
  url: "http://mimir:9009/prometheus"
couchbase:
  enabled: false
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg, err := LoadConfig(path, nil)
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.Server.Port != 9999 {
		t.Errorf("Server.Port = %d, want 9999", cfg.Server.Port)
	}
	if cfg.Prometheus.URL != "http://mimir:9009/prometheus" {
		t.Errorf("Prometheus.URL = %q", cfg.Prometheus.URL)
	}
	if cfg.Couchbase.Enabled {
		t.Error("Couchbase.Enabled not overridden to false")
	}
	// Fields absent from the file keep their defaults.
	if cfg.Server.Host != "0.0.0.0" {
		t.Errorf("Server.Host = %q, want default", cfg.Server.Host)
	}
}

func TestLoadConfigMissingFileErrors(t *testing.T) {
	if _, err := LoadConfig(filepath.Join(t.TempDir(), "absent.yaml"), nil); err == nil {
		t.Fatal("expected error for missing config file")
	}
}

func TestApplyFlagOverrides(t *testing.T) {
	cfg, err := LoadConfig("", map[string]string{
		"server.port":               "7070",
		"couchbase.enabled":         "false",
		"logging.level":             "debug",
		"prometheus.url":            "http://mimir:9009/prometheus",
		"couchbase.metadata_bucket": "meta2",
	})
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.Server.Port != 7070 {
		t.Errorf("Server.Port = %d, want 7070", cfg.Server.Port)
	}
	if cfg.Couchbase.Enabled {
		t.Error("Couchbase.Enabled not overridden")
	}
	if cfg.Logging.Level != "debug" {
		t.Errorf("Logging.Level = %q", cfg.Logging.Level)
	}
	if cfg.Prometheus.URL != "http://mimir:9009/prometheus" {
		t.Errorf("Prometheus.URL = %q", cfg.Prometheus.URL)
	}
	if cfg.Couchbase.MetadataBucket != "meta2" {
		t.Errorf("Couchbase.MetadataBucket = %q", cfg.Couchbase.MetadataBucket)
	}
}

// Secrets travel via the environment so they stay out of argv, where `ps` and
// `docker inspect` would expose them.
func TestEnvOverrides(t *testing.T) {
	t.Setenv("DSG_PROMETHEUS_URL", "http://mimir:9009/prometheus")
	t.Setenv("DSG_COUCHBASE_PASSWORD", "s3cret")
	t.Setenv("DSG_COUCHBASE_METADATA_SCOPE", "cbmonitor")
	t.Setenv("DSG_SERVER_PORT", "9999")
	t.Setenv("DSG_COUCHBASE_ENABLED", "false")

	cfg, err := LoadConfig("", nil)
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.Prometheus.URL != "http://mimir:9009/prometheus" {
		t.Errorf("Prometheus.URL = %q", cfg.Prometheus.URL)
	}
	if cfg.Couchbase.Password != "s3cret" {
		t.Errorf("Couchbase.Password = %q", cfg.Couchbase.Password)
	}
	if cfg.Couchbase.MetadataScope != "cbmonitor" {
		t.Errorf("Couchbase.MetadataScope = %q", cfg.Couchbase.MetadataScope)
	}
	if cfg.Server.Port != 9999 {
		t.Errorf("Server.Port = %d", cfg.Server.Port)
	}
	if cfg.Couchbase.Enabled {
		t.Error("Couchbase.Enabled not overridden to false")
	}
}

func TestEnvOverridesIgnoreEmptyAndYieldToFlags(t *testing.T) {
	t.Setenv("DSG_PROMETHEUS_URL", "")
	t.Setenv("DSG_LOG_LEVEL", "warn")

	cfg, err := LoadConfig("", map[string]string{"logging.level": "debug"})
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	// Empty env var leaves the default in place.
	if cfg.Prometheus.URL != "http://localhost:9009/prometheus" {
		t.Errorf("Prometheus.URL = %q, want the default", cfg.Prometheus.URL)
	}
	// An explicit flag override wins over the environment.
	if cfg.Logging.Level != "debug" {
		t.Errorf("Logging.Level = %q, want flag override to win", cfg.Logging.Level)
	}
}

func TestEnvOverrideRejectsBadValue(t *testing.T) {
	t.Setenv("DSG_SERVER_PORT", "not-a-port")
	if _, err := LoadConfig("", nil); err == nil {
		t.Fatal("expected an error for a non-numeric port")
	}
}

func TestApplyFlagOverridesRejectsBadInput(t *testing.T) {
	cases := map[string]string{
		"noseparator":       "1",     // missing section.field form
		"unknown.field":     "1",     // unknown section
		"server.nope":       "1",     // unknown field
		"server.port":       "abc",   // type mismatch
		"couchbase.enabled": "maybe", // bad bool
	}
	for path, value := range cases {
		if _, err := LoadConfig("", map[string]string{path: value}); err == nil {
			t.Errorf("override %s=%s should error", path, value)
		}
	}
}
