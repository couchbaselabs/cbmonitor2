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

// LoadConfig loads configuration from file and optionally applies flag overrides
func LoadConfig(configPath string, flagOverrides map[string]string) (*Config, error) {
	var config Config
	// Always set defaults first
	setDefaults(&config)

	if len(configPath) > 0 {
		if err := LoadConfigFromFile(&config, configPath); err != nil {
			return nil, fmt.Errorf("failed to load config file: %w", err)
		}
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

	// Convert and set the value based on the field type
	if err := setFieldValue(fieldValue, value); err != nil {
		return fmt.Errorf("failed to set %s.%s: %w", section, field, err)
	}

	return nil
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
