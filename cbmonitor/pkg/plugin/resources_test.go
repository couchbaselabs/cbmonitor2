package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// mockCallResourceResponseSender implements backend.CallResourceResponseSender
// for use in tests.
type mockCallResourceResponseSender struct {
	response *backend.CallResourceResponse
}

// Send sets the received *backend.CallResourceResponse to s.response
func (s *mockCallResourceResponseSender) Send(response *backend.CallResourceResponse) error {
	s.response = response
	return nil
}

// newAppWithSettings builds an *App pre-loaded with the given PluginSettings
// without going through NewApp's validation (so tests can exercise route
// registration in isolation from a real Couchbase server).
func newAppWithSettings(t *testing.T, settings *PluginSettings) *App {
	t.Helper()
	// Inject settings by hand: serialise → AppInstanceSettings → NewApp keeps
	// the wiring identical to the runtime path. We tolerate Couchbase service
	// init failures (services degrade to nil) since tests don't have a real
	// cluster.
	js, err := json.Marshal(settings)
	if err != nil {
		t.Fatalf("marshal settings: %v", err)
	}
	inst, err := NewApp(context.Background(), backend.AppInstanceSettings{
		JSONData:                js,
		DecryptedSecureJSONData: map[string]string{secureFieldCouchbasePassword: settings.CouchbaseServer.Password},
	})
	if err != nil {
		t.Fatalf("NewApp: %v", err)
	}
	app, ok := inst.(*App)
	if !ok {
		t.Fatalf("inst not *App, got %T", inst)
	}
	return app
}

func call(t *testing.T, app *App, method, path string, body []byte) *backend.CallResourceResponse {
	t.Helper()
	var r mockCallResourceResponseSender
	if err := app.CallResource(context.Background(), &backend.CallResourceRequest{
		Method: method,
		Path:   path,
		Body:   body,
	}, &r); err != nil {
		t.Fatalf("CallResource error: %s", err)
	}
	if r.response == nil {
		t.Fatal("no response received from CallResource")
	}
	return r.response
}

func TestCallResource_AlwaysRegisteredRoutes(t *testing.T) {
	app := newAppWithSettings(t, defaultSettings())

	for _, tc := range []struct {
		name      string
		method    string
		path      string
		body      []byte
		expStatus int
		expBody   []byte
	}{
		{name: "get ping 200", method: http.MethodGet, path: "ping", expStatus: http.StatusOK},
		{name: "get echo 405", method: http.MethodGet, path: "echo", expStatus: http.StatusMethodNotAllowed},
		{name: "post echo 200", method: http.MethodPost, path: "echo", body: []byte(`{"message":"ok"}`), expStatus: http.StatusOK, expBody: []byte(`{"message":"ok"}`)},
		{name: "get non existing handler 404", method: http.MethodGet, path: "not_found", expStatus: http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp := call(t, app, tc.method, tc.path, tc.body)
			if tc.expStatus > 0 && tc.expStatus != resp.Status {
				t.Errorf("response status should be %d, got %d", tc.expStatus, resp.Status)
			}
			if len(tc.expBody) > 0 {
				if tb := bytes.TrimSpace(resp.Body); !bytes.Equal(tb, tc.expBody) {
					t.Errorf("response body should be %s, got %s", tc.expBody, tb)
				}
			}
		})
	}
}

func TestCallResource_DatasourceConfigReflectsSettings(t *testing.T) {
	settings := &PluginSettings{
		CouchbaseServer:      CouchbaseServerSettings{ConnectionString: "couchbase://x", Username: "u"},
		Snapshots:            SnapshotsSettings{Enabled: false},
		CouchbaseDatasource:  CouchbaseDatasourceSettings{Enabled: true, Bucket: "cbmonitor"},
		PrometheusDatasource: PrometheusDatasourceSettings{Enabled: false},
	}
	app := newAppWithSettings(t, settings)

	resp := call(t, app, http.MethodGet, "config/datasources", nil)
	if resp.Status != http.StatusOK {
		t.Fatalf("config/datasources status = %d", resp.Status)
	}
	var got struct {
		PrometheusAvailable bool   `json:"prometheusAvailable"`
		CouchbaseAvailable  bool   `json:"couchbaseAvailable"`
		DefaultDataSource   string `json:"defaultDataSource"`
	}
	if err := json.Unmarshal(resp.Body, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.PrometheusAvailable {
		t.Errorf("PrometheusAvailable should be false")
	}
	if !got.CouchbaseAvailable {
		t.Errorf("CouchbaseAvailable should be true")
	}
	if got.DefaultDataSource != "couchbase" {
		t.Errorf("DefaultDataSource = %q, want couchbase", got.DefaultDataSource)
	}
}

func TestCallResource_DatasourceRoutesGatedByToggle(t *testing.T) {
	// Couchbase datasource OFF → /query, /query_range, /series should 404.
	app := newAppWithSettings(t, defaultSettings())

	for _, path := range []string{"query", "query_range", "series"} {
		t.Run("off/"+path, func(t *testing.T) {
			resp := call(t, app, http.MethodGet, path, nil)
			if resp.Status != http.StatusNotFound {
				t.Errorf("%s with Couchbase DS off: status = %d, want 404", path, resp.Status)
			}
		})
	}
}

func TestCallResource_SettingsErrorSurfacedInConfig(t *testing.T) {
	// Malformed jsonData (prometheus URL fails validation) → NewApp catches
	// the error, runs on defaultSettings(), and /config/datasources must
	// expose settings.valid=false with the error message so the UI can
	// banner that user input was rejected.
	inst, err := NewApp(context.Background(), backend.AppInstanceSettings{
		JSONData: []byte(`{"prometheusDatasource":{"enabled":true,"url":"not-a-url"}}`),
	})
	if err != nil {
		t.Fatalf("NewApp should tolerate invalid settings, got: %v", err)
	}
	app := inst.(*App)

	resp := call(t, app, http.MethodGet, "config/datasources", nil)
	if resp.Status != http.StatusOK {
		t.Fatalf("config/datasources status = %d", resp.Status)
	}

	var got struct {
		Settings struct {
			Valid bool   `json:"valid"`
			Error string `json:"error"`
		} `json:"settings"`
	}
	if err := json.Unmarshal(resp.Body, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Settings.Valid {
		t.Errorf("expected settings.valid = false, got true")
	}
	if got.Settings.Error == "" {
		t.Errorf("expected non-empty settings.error explaining the rejection")
	}
}

func TestCallResource_SettingsValidWhenAccepted(t *testing.T) {
	// Clean default settings (no user-supplied JSONData) → LoadSettings
	// succeeds → settings.valid = true, no error string.
	app := newAppWithSettings(t, defaultSettings())
	resp := call(t, app, http.MethodGet, "config/datasources", nil)
	if resp.Status != http.StatusOK {
		t.Fatalf("config/datasources status = %d", resp.Status)
	}
	var got struct {
		Settings struct {
			Valid bool   `json:"valid"`
			Error string `json:"error"`
		} `json:"settings"`
	}
	if err := json.Unmarshal(resp.Body, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !got.Settings.Valid {
		t.Errorf("expected settings.valid = true for a clean default app")
	}
	if got.Settings.Error != "" {
		t.Errorf("expected empty settings.error, got %q", got.Settings.Error)
	}
}

func TestCallResource_SnapshotRoutesGatedByToggle(t *testing.T) {
	// Snapshots OFF → /snapshots/foo should 404.
	app := newAppWithSettings(t, defaultSettings())
	resp := call(t, app, http.MethodGet, "snapshots/foo", nil)
	if resp.Status != http.StatusNotFound {
		t.Errorf("snapshots route with Snapshots off: status = %d, want 404", resp.Status)
	}
}

// healthcheckResponse mirrors the JSON returned by /healthcheck/connection.
// Each sub-object is either skipped (feature off) or carries a probe result
// (ok, bucket, error). The frontend renders each independently.
type healthcheckResponse struct {
	Snapshots           healthcheckBucket `json:"snapshots"`
	CouchbaseDatasource healthcheckBucket `json:"couchbaseDatasource"`
}

type healthcheckBucket struct {
	Skipped bool   `json:"skipped"`
	Reason  string `json:"reason"`
	OK      bool   `json:"ok"`
	Bucket  string `json:"bucket"`
	Error   string `json:"error"`
}

func TestCallResource_HealthcheckSkipsBothWhenAllFeaturesDisabled(t *testing.T) {
	// Default settings have both features off. The healthcheck must mark
	// each sub-result `skipped: true` with a clear reason — distinct from
	// a real connection failure so the frontend can render a grey "Off"
	// rather than a red "Fail".
	app := newAppWithSettings(t, defaultSettings())
	resp := call(t, app, http.MethodGet, "healthcheck/connection", nil)
	if resp.Status != http.StatusOK {
		t.Fatalf("healthcheck status = %d, want 200", resp.Status)
	}
	var got healthcheckResponse
	if err := json.Unmarshal(resp.Body, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !got.Snapshots.Skipped {
		t.Errorf("expected snapshots.skipped = true when feature off")
	}
	if got.Snapshots.Reason == "" {
		t.Errorf("expected non-empty snapshots.reason")
	}
	if got.Snapshots.OK {
		t.Errorf("skipped probe must not report ok=true")
	}
	if !got.CouchbaseDatasource.Skipped {
		t.Errorf("expected couchbaseDatasource.skipped = true when feature off")
	}
	if got.CouchbaseDatasource.Reason == "" {
		t.Errorf("expected non-empty couchbaseDatasource.reason")
	}
}
