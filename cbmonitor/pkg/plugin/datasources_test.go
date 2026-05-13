package plugin

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeGrafana records every request the reconciler makes and serves a
// per-UID datasource state. It exists only to validate the wire protocol
// (paths, methods, auth header, body shape) — not to mimic Grafana
// faithfully.
type fakeGrafana struct {
	mu       sync.Mutex
	store    map[string]map[string]any // uid -> live datasource doc
	requests []recordedRequest
}

type recordedRequest struct {
	method string
	path   string
	body   map[string]any
	auth   string
}

func newFakeGrafana() *fakeGrafana {
	return &fakeGrafana{store: map[string]map[string]any{}}
}

func (f *fakeGrafana) handler(t *testing.T) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()

		rec := recordedRequest{method: r.Method, path: r.URL.Path, auth: r.Header.Get("Authorization")}
		if r.Body != nil {
			raw, _ := io.ReadAll(r.Body)
			if len(raw) > 0 {
				_ = json.Unmarshal(raw, &rec.body)
			}
		}
		f.requests = append(f.requests, rec)

		switch {
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/datasources/uid/"):
			uid := strings.TrimPrefix(r.URL.Path, "/api/datasources/uid/")
			live, ok := f.store[uid]
			if !ok {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			_ = json.NewEncoder(w).Encode(live)

		case r.Method == http.MethodPost && r.URL.Path == "/api/datasources":
			uid, _ := rec.body["uid"].(string)
			if uid == "" {
				t.Fatalf("create body missing uid: %#v", rec.body)
			}
			f.store[uid] = mergeCreate(rec.body)
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(f.store[uid])

		case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/api/datasources/uid/"):
			uid := strings.TrimPrefix(r.URL.Path, "/api/datasources/uid/")
			existing, ok := f.store[uid]
			if !ok {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			for k, v := range rec.body {
				existing[k] = v
			}
			f.store[uid] = existing
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(existing)

		default:
			http.Error(w, "unhandled "+r.Method+" "+r.URL.Path, http.StatusBadRequest)
		}
	})
}

func mergeCreate(body map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range body {
		out[k] = v
	}
	out["readOnly"] = false
	return out
}

func newTestReconciler(server *httptest.Server) *Reconciler {
	return &Reconciler{
		httpClient: server.Client(),
		appURL:     server.URL,
		saToken:    "test-token",
	}
}

func TestReconcile_CreatesMissingDatasource(t *testing.T) {
	fake := newFakeGrafana()
	srv := httptest.NewServer(fake.handler(t))
	defer srv.Close()

	r := newTestReconciler(srv)
	desired := []DesiredDatasource{{
		UID: "prometheus", Name: "Prometheus", Type: "prometheus", Access: "proxy",
		URL: "http://prom:9090", IsDefault: true,
		JSONData: map[string]any{"httpMethod": "POST"},
	}}

	if err := r.Reconcile(context.Background(), desired); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}

	live, ok := fake.store["prometheus"]
	if !ok {
		t.Fatalf("expected datasource to be created, store=%v", fake.store)
	}
	if live["url"] != "http://prom:9090" {
		t.Errorf("created datasource has wrong URL: %v", live["url"])
	}
	hasPost := false
	for _, req := range fake.requests {
		if req.method == http.MethodPost && req.path == "/api/datasources" {
			hasPost = true
			if req.auth != "Bearer test-token" {
				t.Errorf("create missing/wrong Authorization header: %q", req.auth)
			}
		}
	}
	if !hasPost {
		t.Errorf("expected a POST /api/datasources call, got %#v", fake.requests)
	}
}

func TestReconcile_NoOpWhenEqual(t *testing.T) {
	fake := newFakeGrafana()
	fake.store["prometheus"] = map[string]any{
		"uid": "prometheus", "name": "Prometheus", "type": "prometheus",
		"access": "proxy", "url": "http://prom:9090", "isDefault": true,
		"jsonData": map[string]any{"httpMethod": "POST"},
		"readOnly": false,
	}
	srv := httptest.NewServer(fake.handler(t))
	defer srv.Close()

	r := newTestReconciler(srv)
	desired := []DesiredDatasource{{
		UID: "prometheus", Name: "Prometheus", Type: "prometheus", Access: "proxy",
		URL: "http://prom:9090", IsDefault: true,
		JSONData: map[string]any{"httpMethod": "POST"},
	}}

	if err := r.Reconcile(context.Background(), desired); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}

	// No mutating calls expected — only the GET.
	for _, req := range fake.requests {
		if req.method != http.MethodGet {
			t.Errorf("expected no mutations, got %s %s", req.method, req.path)
		}
	}
}

func TestReconcile_UpdatesOnURLDiff(t *testing.T) {
	fake := newFakeGrafana()
	fake.store["prometheus"] = map[string]any{
		"uid": "prometheus", "name": "Prometheus", "type": "prometheus",
		"access": "proxy", "url": "http://old:9090", "isDefault": true,
		"jsonData": map[string]any{"httpMethod": "POST"},
		"readOnly": false,
	}
	srv := httptest.NewServer(fake.handler(t))
	defer srv.Close()

	r := newTestReconciler(srv)
	desired := []DesiredDatasource{{
		UID: "prometheus", Name: "Prometheus", Type: "prometheus", Access: "proxy",
		URL: "http://new:9090", IsDefault: true,
		JSONData: map[string]any{"httpMethod": "POST"},
	}}

	if err := r.Reconcile(context.Background(), desired); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}

	if got := fake.store["prometheus"]["url"]; got != "http://new:9090" {
		t.Errorf("URL not updated, got %v", got)
	}
	sawPut := false
	for _, req := range fake.requests {
		if req.method == http.MethodPut {
			sawPut = true
			if _, hasUID := req.body["uid"]; hasUID {
				t.Errorf("PUT body must not include uid (it's in the path); got %#v", req.body)
			}
		}
	}
	if !sawPut {
		t.Errorf("expected PUT, got requests %#v", fake.requests)
	}
}

func TestReconcile_SkipsReadOnlyDatasource(t *testing.T) {
	fake := newFakeGrafana()
	fake.store["prometheus"] = map[string]any{
		"uid": "prometheus", "name": "Prometheus", "type": "prometheus",
		"access": "proxy", "url": "http://yaml:9090", "isDefault": true,
		"jsonData": map[string]any{"httpMethod": "POST"},
		"readOnly": true,
	}
	srv := httptest.NewServer(fake.handler(t))
	defer srv.Close()

	r := newTestReconciler(srv)
	desired := []DesiredDatasource{{
		UID: "prometheus", Name: "Prometheus", Type: "prometheus", Access: "proxy",
		URL: "http://new:9090", IsDefault: true,
		JSONData: map[string]any{"httpMethod": "POST"},
	}}

	err := r.Reconcile(context.Background(), desired)
	if err == nil || !strings.Contains(err.Error(), "read-only") {
		t.Fatalf("expected read-only error, got %v", err)
	}
	// No mutation should have been attempted.
	for _, req := range fake.requests {
		if req.method != http.MethodGet {
			t.Errorf("read-only datasource should not be mutated, got %s %s", req.method, req.path)
		}
	}
	// And the live URL should not have changed.
	if got := fake.store["prometheus"]["url"]; got != "http://yaml:9090" {
		t.Errorf("read-only datasource was mutated: url=%v", got)
	}
}

func TestReconcile_SkipsDesiredWithEmptyURL(t *testing.T) {
	fake := newFakeGrafana()
	srv := httptest.NewServer(fake.handler(t))
	defer srv.Close()

	r := newTestReconciler(srv)
	desired := []DesiredDatasource{{
		UID: "prometheus", Name: "Prometheus", Type: "prometheus", Access: "proxy",
		URL: "", // forbidden — must not be POSTed
		JSONData: map[string]any{},
	}}

	err := r.Reconcile(context.Background(), desired)
	if err == nil || !strings.Contains(err.Error(), "empty URL") {
		t.Fatalf("expected empty-URL error, got %v", err)
	}
	if len(fake.requests) != 0 {
		t.Errorf("expected no API calls for empty-URL desired, got %#v", fake.requests)
	}
}

func TestReconcile_OmitsEmptySecrets(t *testing.T) {
	fake := newFakeGrafana()
	srv := httptest.NewServer(fake.handler(t))
	defer srv.Close()

	r := newTestReconciler(srv)
	desired := []DesiredDatasource{{
		UID: "cbdatasource", Name: "cbdatasource", Type: "couchbase-datasource",
		Access: "proxy", URL: "couchbase://cb",
		JSONData:       map[string]any{"host": "couchbase://cb"},
		SecureJSONData: map[string]string{"password": ""},
	}}

	if err := r.Reconcile(context.Background(), desired); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}

	for _, req := range fake.requests {
		if req.method == http.MethodPost {
			if _, hasSecure := req.body["secureJsonData"]; hasSecure {
				t.Errorf("empty secret should not have produced a secureJsonData block, got %#v", req.body)
			}
		}
	}
}

func TestReconcile_ContextCancelled(t *testing.T) {
	// Slow server so the timeout has time to fire.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		http.Error(w, "not found", http.StatusNotFound)
	}))
	defer srv.Close()

	r := newTestReconciler(srv)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := r.Reconcile(ctx, []DesiredDatasource{{
		UID: "prometheus", Name: "p", Type: "prometheus", Access: "proxy",
		URL: "http://prom:9090",
	}})
	if err == nil {
		t.Fatalf("expected an error from cancelled context")
	}
}

func TestDesiredDatasources_OnlyIncludesEnabledWithRequiredFields(t *testing.T) {
	cases := []struct {
		name   string
		s      PluginSettings
		wantUIDs []string
	}{
		{
			name: "prom enabled with URL, couchbase disabled",
			s: PluginSettings{
				PrometheusDatasource: PrometheusDatasourceSettings{Enabled: true, URL: "http://prom:9090"},
			},
			wantUIDs: []string{"prometheus"},
		},
		{
			name: "prom enabled without URL — skipped",
			s: PluginSettings{
				PrometheusDatasource: PrometheusDatasourceSettings{Enabled: true},
			},
			wantUIDs: []string{},
		},
		{
			name: "both enabled with required fields",
			s: PluginSettings{
				PrometheusDatasource: PrometheusDatasourceSettings{Enabled: true, URL: "http://prom"},
				CouchbaseDatasource:  CouchbaseDatasourceSettings{Enabled: true, Bucket: "showfast"},
				CouchbaseServer:      CouchbaseServerSettings{ConnectionString: "couchbase://x"},
			},
			wantUIDs: []string{"prometheus", "cbdatasource"},
		},
		{
			name: "couchbase enabled but connection string missing — skipped",
			s: PluginSettings{
				CouchbaseDatasource: CouchbaseDatasourceSettings{Enabled: true, Bucket: "showfast"},
			},
			wantUIDs: []string{},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := tc.s.desiredDatasources()
			gotUIDs := []string{}
			for _, d := range got {
				gotUIDs = append(gotUIDs, d.UID)
			}
			if !equalSlice(gotUIDs, tc.wantUIDs) {
				t.Errorf("got UIDs %v, want %v", gotUIDs, tc.wantUIDs)
			}
		})
	}
}

func equalSlice(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
