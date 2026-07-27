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
		"server.port":       "7070",
		"couchbase.enabled": "false",
		"logging.level":     "debug",
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
