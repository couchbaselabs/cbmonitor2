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
		CouchbaseDatasource:  CouchbaseDatasourceSettings{Enabled: true, Bucket: "showfast"},
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
	// Couchbase datasource OFF → /metrics/health, /query, /query_range, /series should 404.
	app := newAppWithSettings(t, defaultSettings())

	for _, path := range []string{"metrics/health", "query", "query_range", "series"} {
		t.Run("off/"+path, func(t *testing.T) {
			resp := call(t, app, http.MethodGet, path, nil)
			if resp.Status != http.StatusNotFound {
				t.Errorf("%s with Couchbase DS off: status = %d, want 404", path, resp.Status)
			}
		})
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

func TestCallResource_HealthcheckDisabledWhenSnapshotsOff(t *testing.T) {
	app := newAppWithSettings(t, defaultSettings())
	resp := call(t, app, http.MethodGet, "healthcheck/connection", nil)
	if resp.Status != http.StatusOK {
		t.Fatalf("healthcheck status = %d, want 200", resp.Status)
	}
	var got struct {
		Couchbase struct {
			OK    bool   `json:"ok"`
			Error string `json:"error"`
		} `json:"couchbase"`
	}
	if err := json.Unmarshal(resp.Body, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Couchbase.OK {
		t.Errorf("expected ok=false when snapshots disabled")
	}
	if got.Couchbase.Error != "snapshots disabled" {
		t.Errorf("expected error='snapshots disabled', got %q", got.Couchbase.Error)
	}
}
