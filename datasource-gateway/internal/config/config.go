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
// The gateway is a Prometheus-compatible sidecar: it serves a single Grafana
// Prometheus datasource, passing PromQL through to Prometheus for
// Prometheus-backed snapshots and evaluating PromQL over SQL++-fetched
// samples for Couchbase-backed snapshots.
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
		Enabled            bool   `yaml:"enabled"`
		Host               string `yaml:"host"`
		Username           string `yaml:"username"`
		Password           string `yaml:"password"`
		MetadataBucket     string `yaml:"metadata_bucket"`
		MetadataScope      string `yaml:"metadata_scope"`
		MetadataCollection string `yaml:"metadata_collection"`
		MetricsBucket      string `yaml:"metrics_bucket"`
		MetricsScope       string `yaml:"metrics_scope"`
		MetricsCollection  string `yaml:"metrics_collection"`
	} `yaml:"couchbase"`
}

// envOverrides maps the DSG_* environment variables to their config paths.
// Reading secrets from the environment keeps them out of the process's argv,
// where `ps` and `docker inspect` would expose them.
var envOverrides = map[string]string{
	"DSG_SERVER_PORT":                   "server.port",
	"DSG_SERVER_HOST":                   "server.host",
	"DSG_LOG_LEVEL":                     "logging.level",
	"DSG_PROMETHEUS_URL":                "prometheus.url",
	"DSG_COUCHBASE_ENABLED":             "couchbase.enabled",
	"DSG_COUCHBASE_HOST":                "couchbase.host",
	"DSG_COUCHBASE_USERNAME":            "couchbase.username",
	"DSG_COUCHBASE_PASSWORD":            "couchbase.password",
	"DSG_COUCHBASE_METADATA_BUCKET":     "couchbase.metadata_bucket",
	"DSG_COUCHBASE_METADATA_SCOPE":      "couchbase.metadata_scope",
	"DSG_COUCHBASE_METADATA_COLLECTION": "couchbase.metadata_collection",
	"DSG_COUCHBASE_METRICS_BUCKET":      "couchbase.metrics_bucket",
	"DSG_COUCHBASE_METRICS_SCOPE":       "couchbase.metrics_scope",
	"DSG_COUCHBASE_METRICS_COLLECTION":  "couchbase.metrics_collection",
}

// LoadConfig builds the configuration by layering, in increasing precedence:
// built-in defaults, the config file (if provided), DSG_* environment
// variables, then dot-notation flag overrides.
func LoadConfig(configPath string, flagOverrides map[string]string) (*Config, error) {
	var config Config
	setDefaults(&config)

	if len(configPath) > 0 {
		if err := LoadConfigFromFile(&config, configPath); err != nil {
			return nil, fmt.Errorf("failed to load config file: %w", err)
		}
	}

	if err := ApplyEnvOverrides(&config); err != nil {
		return nil, fmt.Errorf("failed to apply environment overrides: %w", err)
	}

	if len(flagOverrides) > 0 {
		if err := ApplyFlagOverrides(&config, flagOverrides); err != nil {
			return nil, fmt.Errorf("failed to apply flag overrides: %w", err)
		}
	}

	return &config, nil
}

// ApplyEnvOverrides applies any set DSG_* environment variables. An unset or
// empty variable leaves the existing value alone.
func ApplyEnvOverrides(config *Config) error {
	for env, path := range envOverrides {
		value, ok := os.LookupEnv(env)
		if !ok || value == "" {
			continue
		}
		if err := setConfigValue(config, path, value); err != nil {
			return fmt.Errorf("%s: %w", env, err)
		}
	}
	return nil
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

// setConfigValue sets a config value using a "section.field" path. Names use
// the same keys as the YAML file (e.g. "prometheus.url", "couchbase.metadata_bucket").
func setConfigValue(config *Config, path, value string) error {
	parts := strings.Split(path, ".")
	if len(parts) < 2 {
		return fmt.Errorf("invalid path format: %s (expected format: section.field)", path)
	}

	section := parts[0]
	field := parts[1]

	configValue := reflect.ValueOf(config).Elem()
	sectionField := fieldByYAMLName(configValue, section)
	if !sectionField.IsValid() {
		return fmt.Errorf("unknown section: %s", section)
	}

	if sectionField.Kind() != reflect.Struct {
		return fmt.Errorf("section %s is not a struct", section)
	}

	fieldValue := fieldByYAMLName(sectionField, field)
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

// fieldByYAMLName resolves a struct field by its yaml tag, falling back to a
// case-insensitive match on the Go field name.
func fieldByYAMLName(structVal reflect.Value, name string) reflect.Value {
	t := structVal.Type()
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		tag, _, _ := strings.Cut(f.Tag.Get("yaml"), ",")
		if tag == name || strings.EqualFold(f.Name, name) {
			return structVal.Field(i)
		}
	}
	return reflect.Value{}
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
	config.Couchbase.MetadataScope = "_default"
	config.Couchbase.MetadataCollection = "_default"
	config.Couchbase.MetricsBucket = "cbmonitor"
	config.Couchbase.MetricsScope = "_default"
	config.Couchbase.MetricsCollection = "_default"
}
