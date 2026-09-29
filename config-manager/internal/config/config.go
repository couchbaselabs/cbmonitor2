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

type Config struct {
	Server struct {
		Port int    `yaml:"port"`
		Host string `yaml:"host"`
	} `yaml:"server"`
	Agent struct {
		Type      string `yaml:"type"`
		Directory string `yaml:"directory"`
	} `yaml:"agent"`
	Logging struct {
		Level string `yaml:"level"`
	} `yaml:"logging"`
	Manager struct {
		Interval     time.Duration  `yaml:"interval"`
		MinInterval  time.Duration  `yaml:"min_interval"`
		StaleThreshold time.Duration   `yaml:"stale_threshold"`
	} `yaml:"manager"`
	Metadata struct {
		Enabled     bool   `yaml:"enabled"`
		Host        string `yaml:"host"`
		Username    string `yaml:"username"`
		Password    string `yaml:"password"`
		Bucket      string `yaml:"bucket"`
		Timeout     time.Duration `yaml:"timeout"`
	} `yaml:"metadata"`
}

// envOverrides maps the CM_* environment variables to their config paths.
// Reading secrets such as the metadata password from the environment keeps
// them out of the process's argv, where `ps` and `docker inspect` expose them.
// Every config field has one; a test enforces it.
var envOverrides = map[string]string{
	"CM_SERVER_PORT":             "server.port",
	"CM_SERVER_HOST":             "server.host",
	"CM_AGENT_TYPE":              "agent.type",
	"CM_AGENT_DIRECTORY":         "agent.directory",
	"CM_LOG_LEVEL":               "logging.level",
	"CM_MANAGER_INTERVAL":        "manager.interval",
	"CM_MANAGER_MIN_INTERVAL":    "manager.min_interval",
	"CM_MANAGER_STALE_THRESHOLD": "manager.stale_threshold",
	"CM_METADATA_ENABLED":        "metadata.enabled",
	"CM_METADATA_HOST":           "metadata.host",
	"CM_METADATA_USERNAME":       "metadata.username",
	"CM_METADATA_PASSWORD":       "metadata.password",
	"CM_METADATA_BUCKET":         "metadata.bucket",
	"CM_METADATA_TIMEOUT":        "metadata.timeout",
}

// LoadConfig builds the configuration by layering, in increasing precedence:
// built-in defaults, the config file (if provided), CM_* environment
// variables, then dot-notation flag overrides.
func LoadConfig(configPath string, flagOverrides map[string]string) (*Config, error) {
	var config Config
	// Always set defaults first
	setDefaults(&config)

	if len(configPath) > 0 {
		if err := LoadConfigFromFile(&config, configPath); err != nil {
			return nil, fmt.Errorf("failed to load config file: %w", err)
		}
	}

	if err := ApplyEnvOverrides(&config); err != nil {
		return nil, fmt.Errorf("failed to apply environment overrides: %w", err)
	}

	// Apply flag overrides if provided
	if len(flagOverrides) > 0 {
		if err := ApplyFlagOverrides(&config, flagOverrides); err != nil {
			return nil, fmt.Errorf("failed to apply flag overrides: %w", err)
		}
	}

	return &config, nil
}

// LoadConfigFromFile loads configuration from file
func LoadConfigFromFile(config *Config, configPath string) error {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("failed to read config file: %w", err)
	}

	if err := yaml.Unmarshal(data, &config); err != nil {
		return fmt.Errorf("failed to parse config file: %w", err)
	}

	return nil
}

// ApplyEnvOverrides applies any set CM_* environment variables. An unset or
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

// ApplyFlagOverrides applies flag overrides to the config using dot notation
func ApplyFlagOverrides(config *Config, overrides map[string]string) error {
	for path, value := range overrides {
		if err := setConfigValue(config, path, value); err != nil {
			return fmt.Errorf("failed to set %s: %w", path, err)
		}
	}
	return nil
}

// setConfigValue sets a config value using dot notation path
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

	// Convert and set the value based on the field type
	if err := setFieldValue(fieldValue, value); err != nil {
		return fmt.Errorf("failed to set %s.%s: %w", section, field, err)
	}

	return nil
}

// fieldByYAMLName resolves a struct field by its yaml tag, so paths use the
// same keys as the config file ("manager.stale_threshold").
func fieldByYAMLName(structVal reflect.Value, name string) reflect.Value {
	t := structVal.Type()
	for i := 0; i < t.NumField(); i++ {
		tag, _, _ := strings.Cut(t.Field(i).Tag.Get("yaml"), ",")
		if tag == name {
			return structVal.Field(i)
		}
	}
	return reflect.Value{}
}

// setFieldValue sets a field value with proper type conversion
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

// setDefaults sets default values for the configuration
func setDefaults(config *Config) {
	// Server defaults
	config.Server.Port = 8080
	config.Server.Host = "0.0.0.0"

	// Agent defaults
	config.Agent.Type = "vmagent"
	config.Agent.Directory = "./temp_path"

	// Logging defaults
	config.Logging.Level = "info"

	// Manager defaults
	config.Manager.Interval = 5 * time.Minute
	config.Manager.StaleThreshold = 5 * time.Minute
	config.Manager.MinInterval = 5 * time.Minute

	// Metadata defaults
	config.Metadata.Enabled = true
	config.Metadata.Host = "localhost"
	config.Metadata.Username = "Administrator"
	config.Metadata.Password = "password"
	config.Metadata.Bucket = "metadata"
	config.Metadata.Timeout = 30 * time.Second
}
