package config

import (
	"fmt"
	"os"
	"reflect"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Config holds the datasource-gateway service configuration.
//
// The gateway is a Prometheus-compatible sidecar: it serves a single
// Grafana Prometheus datasource, passing PromQL through to Prometheus for
// Prometheus-backed snapshots and (in later tasks) translating PromQL to
// SQL++ for Couchbase-backed snapshots. The Prometheus and Couchbase sections
// below are loaded now; their clients are wired in subsequent tasks.
type Config struct {
	Server struct {
		Port int    `yaml:"port"`
		Host string `yaml:"host"`
	} `yaml:"server"`
	Logging struct {
		Level string `yaml:"level"`
	} `yaml:"logging"`
	// Prometheus is the upstream Prometheus-compatible store used for the
	// passthrough path (Prometheus-backed snapshots).
	Prometheus struct {
		URL string `yaml:"url"`
	} `yaml:"prometheus"`
	// Couchbase access for snapshot metadata (routing/time-windows) and
	// metrics (the PromQL->SQL++ translation path).
	Couchbase struct {
		Enabled           bool   `yaml:"enabled"`
		Host              string `yaml:"host"`
		Username          string `yaml:"username"`
		Password          string `yaml:"password"`
		MetadataBucket    string `yaml:"metadata_bucket"`
		MetricsBucket     string `yaml:"metrics_bucket"`
		MetricsScope      string `yaml:"metrics_scope"`
		MetricsCollection string `yaml:"metrics_collection"`
	} `yaml:"couchbase"`
}

// LoadConfig loads configuration from file (if provided) over the built-in
// defaults, then applies any dot-notation flag overrides.
func LoadConfig(configPath string, flagOverrides map[string]string) (*Config, error) {
	var config Config
	setDefaults(&config)

	if len(configPath) > 0 {
		if err := LoadConfigFromFile(&config, configPath); err != nil {
			return nil, fmt.Errorf("failed to load config file: %w", err)
		}
	}

	if len(flagOverrides) > 0 {
		if err := ApplyFlagOverrides(&config, flagOverrides); err != nil {
			return nil, fmt.Errorf("failed to apply flag overrides: %w", err)
		}
	}

	return &config, nil
}

// LoadConfigFromFile loads configuration from a YAML file.
func LoadConfigFromFile(config *Config, configPath string) error {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("failed to read config file: %w", err)
	}

	if err := yaml.Unmarshal(data, config); err != nil {
		return fmt.Errorf("failed to parse config file: %w", err)
	}

	return nil
}

// ApplyFlagOverrides applies dot-notation overrides (e.g. "server.port=8090").
func ApplyFlagOverrides(config *Config, overrides map[string]string) error {
	for path, value := range overrides {
		if err := setConfigValue(config, path, value); err != nil {
			return fmt.Errorf("failed to set %s: %w", path, err)
		}
	}
	return nil
}

// setConfigValue sets a config value using a "section.field" path.
func setConfigValue(config *Config, path, value string) error {
	parts := strings.Split(path, ".")
	if len(parts) < 2 {
		return fmt.Errorf("invalid path format: %s (expected format: section.field)", path)
	}

	section := parts[0]
	field := parts[1]

	configValue := reflect.ValueOf(config).Elem()
	sectionField := configValue.FieldByName(strings.Title(section))
	if !sectionField.IsValid() {
		return fmt.Errorf("unknown section: %s", section)
	}

	if sectionField.Kind() != reflect.Struct {
		return fmt.Errorf("section %s is not a struct", section)
	}

	fieldValue := sectionField.FieldByName(strings.Title(field))
	if !fieldValue.IsValid() {
		return fmt.Errorf("unknown field: %s in section: %s", field, section)
	}

	if !fieldValue.CanSet() {
		return fmt.Errorf("field %s in section %s cannot be set", field, section)
	}

	if err := setFieldValue(fieldValue, value); err != nil {
		return fmt.Errorf("failed to set %s.%s: %w", section, field, err)
	}

	return nil
}

// setFieldValue sets a field value with proper type conversion.
func setFieldValue(field reflect.Value, value string) error {
	if field.Type() == reflect.TypeOf(time.Duration(0)) {
		dur, err := time.ParseDuration(value)
		if err != nil {
			return fmt.Errorf("invalid duration value: %s", value)
		}
		field.Set(reflect.ValueOf(dur))
		return nil
	}
	switch field.Kind() {
	case reflect.String:
		field.SetString(value)
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		intVal, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid integer value: %s", value)
		}
		field.SetInt(intVal)
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		uintVal, err := strconv.ParseUint(value, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid unsigned integer value: %s", value)
		}
		field.SetUint(uintVal)
	case reflect.Bool:
		boolVal, err := strconv.ParseBool(value)
		if err != nil {
			return fmt.Errorf("invalid boolean value: %s", value)
		}
		field.SetBool(boolVal)
	case reflect.Float32, reflect.Float64:
		floatVal, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return fmt.Errorf("invalid float value: %s", value)
		}
		field.SetFloat(floatVal)
	default:
		return fmt.Errorf("unsupported field type: %s", field.Kind())
	}
	return nil
}

// setDefaults sets default values for the configuration.
func setDefaults(config *Config) {
	// Server defaults. Port 8090 deliberately avoids the default
	// Prometheus (9090) and Mimir (9009) ports so the gateway can run on
	// the same host as either without colliding.
	config.Server.Port = 8090
	config.Server.Host = "0.0.0.0"

	// Logging defaults
	config.Logging.Level = "info"

	// Prometheus (upstream) defaults
	config.Prometheus.URL = "http://localhost:9009/prometheus"

	// Couchbase defaults
	config.Couchbase.Enabled = true
	config.Couchbase.Host = "localhost"
	config.Couchbase.Username = "Administrator"
	config.Couchbase.Password = "password"
	config.Couchbase.MetadataBucket = "metadata"
	config.Couchbase.MetricsBucket = "cbmonitor"
	config.Couchbase.MetricsScope = "_default"
	config.Couchbase.MetricsCollection = "_default"
}
