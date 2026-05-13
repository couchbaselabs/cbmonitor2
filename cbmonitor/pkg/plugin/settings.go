package plugin

import (
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// PluginSettings is the typed representation of the cbmonitor plugin's
// Grafana-managed configuration. It maps to the JSON payload posted to
// /api/plugins/cbmonitor/settings (jsonData + secureJsonData).
type PluginSettings struct {
	CouchbaseServer      CouchbaseServerSettings      `json:"couchbaseServer"`
	Snapshots            SnapshotsSettings            `json:"snapshots"`
	CouchbaseDatasource  CouchbaseDatasourceSettings  `json:"couchbaseDatasource"`
	PrometheusDatasource PrometheusDatasourceSettings `json:"prometheusDatasource"`
}

type CouchbaseServerSettings struct {
	ConnectionString string `json:"connectionString"`
	Username         string `json:"username"`
	// Password is populated from secureJsonData, never present in jsonData.
	Password string `json:"-"`
}

type SnapshotsSettings struct {
	Enabled bool   `json:"enabled"`
	Bucket  string `json:"bucket"`
	// Scope and Collection are optional; empty means "_default" applied at
	// the service layer.
	Scope      string `json:"scope"`
	Collection string `json:"collection"`
}

type CouchbaseDatasourceSettings struct {
	Enabled bool   `json:"enabled"`
	Bucket  string `json:"bucket"`
	Scope      string `json:"scope"`
	Collection string `json:"collection"`
}

type PrometheusDatasourceSettings struct {
	Enabled   bool   `json:"enabled"`
	IsDefault bool   `json:"isDefault"`
	URL       string `json:"url"`
}

// secureFieldCouchbasePassword is the secureJsonData key that holds the
// Couchbase server password.
const secureFieldCouchbasePassword = "couchbasePassword"

// LoadSettings parses Grafana's AppInstanceSettings into a PluginSettings,
// applying fallbacks for missing fields and validating that the Couchbase
// server connection details are present whenever a feature that needs them
// is enabled.
func LoadSettings(s backend.AppInstanceSettings) (*PluginSettings, error) {
	settings := defaultSettings()

	if len(s.JSONData) > 0 {
		if err := json.Unmarshal(s.JSONData, settings); err != nil {
			return nil, fmt.Errorf("parse plugin jsonData: %w", err)
		}
	}

	if pw, ok := s.DecryptedSecureJSONData[secureFieldCouchbasePassword]; ok {
		settings.CouchbaseServer.Password = pw
	}

	if err := settings.validate(); err != nil {
		return nil, err
	}

	return settings, nil
}

// defaultSettings returns a fully-disabled configuration. An admin who has
// never opened the Configuration page gets a plugin that runs but exposes
// no feature routes, which is safer than booting with stale defaults.
func defaultSettings() *PluginSettings {
	return &PluginSettings{
		CouchbaseServer: CouchbaseServerSettings{
			ConnectionString: "",
			Username:         "",
		},
		Snapshots: SnapshotsSettings{
			Enabled: false,
			Bucket:  "",
		},
		CouchbaseDatasource: CouchbaseDatasourceSettings{
			Enabled: false,
			Bucket:  "",
		},
		PrometheusDatasource: PrometheusDatasourceSettings{
			Enabled:   true,
			IsDefault: true,
		},
	}
}

func (s *PluginSettings) validate() error {
	needsServer := s.Snapshots.Enabled || s.CouchbaseDatasource.Enabled
	if needsServer {
		if s.CouchbaseServer.ConnectionString == "" {
			return fmt.Errorf("couchbaseServer.connectionString is required when snapshots or couchbase datasource is enabled")
		}
		if s.CouchbaseServer.Username == "" {
			return fmt.Errorf("couchbaseServer.username is required when snapshots or couchbase datasource is enabled")
		}
	}
	if s.Snapshots.Enabled && s.Snapshots.Bucket == "" {
		return fmt.Errorf("snapshots.bucket is required when snapshots is enabled")
	}
	if s.CouchbaseDatasource.Enabled && s.CouchbaseDatasource.Bucket == "" {
		return fmt.Errorf("couchbaseDatasource.bucket is required when couchbase datasource is enabled")
	}
	if s.PrometheusDatasource.URL != "" {
		u, err := url.Parse(s.PrometheusDatasource.URL)
		if err != nil || u.Scheme == "" || u.Host == "" {
			return fmt.Errorf("prometheusDatasource.url must be an absolute URL (e.g. http://prometheus:9090)")
		}
	}
	return nil
}

// DefaultDataSource returns the wire value for the /config/datasources response's "defaultDataSource" field.
// It honours user intent (the PrometheusDatasource.IsDefault flag) but falls back to whichever
// datasource is actually enabled.
func (s *PluginSettings) DefaultDataSource() string {
	prom := s.PrometheusDatasource.Enabled
	cb := s.CouchbaseDatasource.Enabled
	switch {
	case prom && s.PrometheusDatasource.IsDefault:
		return "prometheus"
	case cb && !s.PrometheusDatasource.IsDefault:
		return "couchbase"
	case prom:
		return "prometheus"
	case cb:
		return "couchbase"
	default:
		return "prometheus"
	}
}
