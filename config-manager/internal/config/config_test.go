package config

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func writeConfig(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

// Every key in the file used to work on its own, but a two-word key such as
// manager.min_interval could not be overridden: the field lookup title-cased
// the key and found no "Min_interval" field.
func TestOverridesResolveMultiWordKeys(t *testing.T) {
	c, err := LoadConfig("", map[string]string{
		"manager.min_interval":    "6m",
		"manager.stale_threshold": "7m",
		"metadata.timeout":        "45s",
	})
	if err != nil {
		t.Fatal(err)
	}
	if c.Manager.MinInterval != 6*time.Minute || c.Manager.StaleThreshold != 7*time.Minute || c.Metadata.Timeout != 45*time.Second {
		t.Errorf("got min_interval %v stale_threshold %v timeout %v", c.Manager.MinInterval, c.Manager.StaleThreshold, c.Metadata.Timeout)
	}
}

func TestPrecedenceIsDefaultsThenFileThenEnvThenFlags(t *testing.T) {
	p := writeConfig(t, "server:\n  port: 9000\nlogging:\n  level: warn\nmetadata:\n  bucket: from-file\n")
	t.Setenv("CM_SERVER_PORT", "9100")
	t.Setenv("CM_METADATA_PASSWORD", "from-env")

	c, err := LoadConfig(p, map[string]string{"server.port": "9200"})
	if err != nil {
		t.Fatal(err)
	}
	if c.Server.Port != 9200 {
		t.Errorf("port %d, want the flag's 9200 over env and file", c.Server.Port)
	}
	if c.Logging.Level != "warn" || c.Metadata.Bucket != "from-file" {
		t.Errorf("file values lost: level %q bucket %q", c.Logging.Level, c.Metadata.Bucket)
	}
	if c.Metadata.Password != "from-env" {
		t.Errorf("password %q, want it read from CM_METADATA_PASSWORD", c.Metadata.Password)
	}
	if c.Manager.Interval != 5*time.Minute {
		t.Errorf("default interval lost: %v", c.Manager.Interval)
	}
}

func TestEmptyEnvLeavesTheValueAlone(t *testing.T) {
	t.Setenv("CM_METADATA_BUCKET", "")
	c, err := LoadConfig("", nil)
	if err != nil {
		t.Fatal(err)
	}
	if c.Metadata.Bucket != "metadata" {
		t.Errorf("bucket %q, want the default", c.Metadata.Bucket)
	}
}

func TestInvalidEnvValueNamesTheVariable(t *testing.T) {
	t.Setenv("CM_MANAGER_INTERVAL", "five minutes")
	_, err := LoadConfig("", nil)
	if err == nil || !strings.Contains(err.Error(), "CM_MANAGER_INTERVAL") {
		t.Errorf("err = %v, want it to name CM_MANAGER_INTERVAL", err)
	}
}

// A field added to Config without an environment variable could not be set
// from the environment, which is the only safe place for secrets.
func TestEveryConfigFieldHasAnEnvironmentVariable(t *testing.T) {
	covered := map[string]bool{}
	for _, path := range envOverrides {
		covered[path] = true
	}
	ct := reflect.TypeOf(Config{})
	for i := 0; i < ct.NumField(); i++ {
		section := ct.Field(i)
		sectionTag, _, _ := strings.Cut(section.Tag.Get("yaml"), ",")
		for j := 0; j < section.Type.NumField(); j++ {
			fieldTag, _, _ := strings.Cut(section.Type.Field(j).Tag.Get("yaml"), ",")
			path := sectionTag + "." + fieldTag
			if !covered[path] {
				t.Errorf("%s has no CM_* environment variable in envOverrides", path)
			}
		}
	}
	// And every mapped path resolves to a real field.
	var c Config
	for env, path := range envOverrides {
		parts := strings.SplitN(path, ".", 2)
		section := fieldByYAMLName(reflect.ValueOf(&c).Elem(), parts[0])
		if !section.IsValid() || !fieldByYAMLName(section, parts[1]).IsValid() {
			t.Errorf("%s maps to %s, which is not a config field", env, path)
		}
	}
}
