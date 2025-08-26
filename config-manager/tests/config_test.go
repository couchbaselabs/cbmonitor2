package tests

import (
	"os"
	"testing"

	"github.com/couchbase/config-manager/internal/config"
)

func TestApplyFlagOverrides(t *testing.T) {
	// Create a temporary config file
	tempFile := createTempConfig(t)
	defer os.Remove(tempFile)

	// Test cases
	tests := []struct {
		name      string
		overrides map[string]string
		expected  config.Config
	}{
		{
			name: "override server host and port",
			overrides: map[string]string{
				"server.host": "127.0.0.1",
				"server.port": "9090",
			},
			expected: func() config.Config {
				var cfg config.Config
				cfg.Server.Port = 9090
				cfg.Server.Host = "127.0.0.1"
				cfg.Agent.Type = "vmagent"
				cfg.Agent.Directory = "./temp_path"
				cfg.Logging.Level = "info"
				cfg.Manager.Interval = "2"
				return cfg
			}(),
		},
		{
			name: "override agent type and logging level",
			overrides: map[string]string{
				"agent.type":    "prometheus",
				"logging.level": "debug",
			},
			expected: func() config.Config {
				var cfg config.Config
				cfg.Server.Port = 8080
				cfg.Server.Host = "0.0.0.0"
				cfg.Agent.Type = "prometheus"
				cfg.Agent.Directory = "./temp_path"
				cfg.Logging.Level = "debug"
				cfg.Manager.Interval = "2"
				return cfg
			}(),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := config.LoadConfig(tempFile, tt.overrides)
			if err != nil {
				t.Fatalf("LoadConfig failed: %v", err)
			}

			// Check if overrides were applied correctly
			if cfg.Server.Host != tt.expected.Server.Host {
				t.Errorf("Server.Host = %v, want %v", cfg.Server.Host, tt.expected.Server.Host)
			}
			if cfg.Server.Port != tt.expected.Server.Port {
				t.Errorf("Server.Port = %v, want %v", cfg.Server.Port, tt.expected.Server.Port)
			}
			if cfg.Agent.Type != tt.expected.Agent.Type {
				t.Errorf("Agent.Type = %v, want %v", cfg.Agent.Type, tt.expected.Agent.Type)
			}
			if cfg.Logging.Level != tt.expected.Logging.Level {
				t.Errorf("Logging.Level = %v, want %v", cfg.Logging.Level, tt.expected.Logging.Level)
			}
		})
	}
}

func TestApplyFlagOverridesErrors(t *testing.T) {
	cfg := &config.Config{}

	// Test invalid path format
	err := config.ApplyFlagOverrides(cfg, map[string]string{"invalid": "value"})
	if err == nil {
		t.Error("Expected error for invalid path format")
	}

	// Test unknown section
	err = config.ApplyFlagOverrides(cfg, map[string]string{"unknown.field": "value"})
	if err == nil {
		t.Error("Expected error for unknown section")
	}

	// Test unknown field
	err = config.ApplyFlagOverrides(cfg, map[string]string{"server.unknown": "value"})
	if err == nil {
		t.Error("Expected error for unknown field")
	}

	// Test invalid type conversion
	err = config.ApplyFlagOverrides(cfg, map[string]string{"server.port": "not_a_number"})
	if err == nil {
		t.Error("Expected error for invalid type conversion")
	}
}

func createTempConfig(t *testing.T) string {
	content := `server:
  port: 8080
  host: "0.0.0.0"
agent:
  type: "vmagent"
  directory: "./temp_path"
logging:
  level: "info"
manager:
  interval: "2"
`

	tmpfile, err := os.CreateTemp("", "config_*.yaml")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := tmpfile.Write([]byte(content)); err != nil {
		t.Fatal(err)
	}
	if err := tmpfile.Close(); err != nil {
		t.Fatal(err)
	}

	return tmpfile.Name()
}
