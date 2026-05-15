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

		case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/api/datasources/uid/"):
			uid := strings.TrimPrefix(r.URL.Path, "/api/datasources/uid/")
			if _, ok := f.store[uid]; !ok {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			delete(f.store, uid)
			w.WriteHeader(http.StatusOK)

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

	if err := r.Reconcile(context.Background(), desired, nil); err != nil {
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

	if err := r.Reconcile(context.Background(), desired, nil); err != nil {
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

	if err := r.Reconcile(context.Background(), desired, nil); err != nil {
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

	err := r.Reconcile(context.Background(), desired, nil)
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

	err := r.Reconcile(context.Background(), desired, nil)
	if err == nil || !strings.Contains(err.Error(), "empty URL") {
		t.Fatalf("expected empty-URL error, got %v", err)
	}
	// No mutating calls should have been made for prometheus. The delete
	// phase may issue a GET on cbdatasource (it's app-managed and not in
	// `desired`), and that's expected/fine — assert specifically that no
	// POST/PUT happened.
	for _, req := range fake.requests {
		if req.method == http.MethodPost || req.method == http.MethodPut {
			t.Errorf("empty-URL desired should not trigger POST/PUT, got %s %s", req.method, req.path)
		}
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

	if err := r.Reconcile(context.Background(), desired, nil); err != nil {
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
	}}, nil)
	if err == nil {
		t.Fatalf("expected an error from cancelled context")
	}
}

func TestReconcile_DeletesOrphanedAppManagedDatasource(t *testing.T) {
	// Pre-existing app-managed datasource (e.g. user toggled prometheus
	// on previously) should be DELETEd when the current `desired` list
	// no longer includes it (toggled off).
	fake := newFakeGrafana()
	fake.store["prometheus"] = map[string]any{
		"uid": "prometheus", "name": "Prometheus", "type": "prometheus",
		"access": "proxy", "url": "http://prom:9090", "readOnly": false,
	}
	srv := httptest.NewServer(fake.handler(t))
	defer srv.Close()

	r := newTestReconciler(srv)
	// desired is empty — the user disabled prometheus.
	if err := r.Reconcile(context.Background(), []DesiredDatasource{}, nil); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}

	if _, present := fake.store["prometheus"]; present {
		t.Errorf("expected prometheus to be deleted from store, still present")
	}
	sawDelete := false
	for _, req := range fake.requests {
		if req.method == http.MethodDelete && req.path == "/api/datasources/uid/prometheus" {
			sawDelete = true
			if req.auth != "Bearer test-token" {
				t.Errorf("delete missing/wrong Authorization header: %q", req.auth)
			}
		}
	}
	if !sawDelete {
		t.Errorf("expected a DELETE /api/datasources/uid/prometheus call, got %#v", fake.requests)
	}
}

func TestReconcile_DeleteAbsentUIDIsNoOp(t *testing.T) {
	// When an app-managed UID doesn't exist in Grafana (e.g. fresh
	// install where the user never enabled that feature), the reconciler
	// should silently skip the delete — a 404 on GET is success.
	fake := newFakeGrafana()
	srv := httptest.NewServer(fake.handler(t))
	defer srv.Close()

	r := newTestReconciler(srv)
	if err := r.Reconcile(context.Background(), []DesiredDatasource{}, nil); err != nil {
		t.Fatalf("Reconcile should tolerate absent UIDs: %v", err)
	}
	// Only GETs (one per appManagedUID) — no DELETE attempted.
	for _, req := range fake.requests {
		if req.method == http.MethodDelete {
			t.Errorf("unexpected DELETE on absent UID: %s", req.path)
		}
	}
}

func TestReconcile_RefusesToDeleteReadOnlyDatasource(t *testing.T) {
	// A YAML-provisioned (readOnly) datasource that happens to share a
	// UID with an app-managed one must NOT be deleted — that would fight
	// provisioning. Surface as error instead.
	fake := newFakeGrafana()
	fake.store["prometheus"] = map[string]any{
		"uid": "prometheus", "name": "Prometheus", "type": "prometheus",
		"access": "proxy", "url": "http://yaml:9090", "readOnly": true,
	}
	srv := httptest.NewServer(fake.handler(t))
	defer srv.Close()

	r := newTestReconciler(srv)
	err := r.Reconcile(context.Background(), []DesiredDatasource{}, nil)
	if err == nil || !strings.Contains(err.Error(), "read-only") {
		t.Fatalf("expected read-only refusal error, got %v", err)
	}
	if _, present := fake.store["prometheus"]; !present {
		t.Errorf("read-only datasource was deleted; must be preserved")
	}
	for _, req := range fake.requests {
		if req.method == http.MethodDelete {
			t.Errorf("DELETE should not be attempted on read-only datasource: %s", req.path)
		}
	}
}

func TestReconcile_CreatesOneDeletesAnotherInSinglePass(t *testing.T) {
	// User toggled couchbase OFF and prometheus ON at the same time:
	// reconciler should DELETE cbdatasource and CREATE prometheus in
	// the same pass. Verifies both phases coexist.
	fake := newFakeGrafana()
	fake.store["cbdatasource"] = map[string]any{
		"uid": "cbdatasource", "name": "cbdatasource", "type": "couchbase-datasource",
		"access": "proxy", "url": "couchbase://old", "readOnly": false,
	}
	srv := httptest.NewServer(fake.handler(t))
	defer srv.Close()

	r := newTestReconciler(srv)
	desired := []DesiredDatasource{{
		UID: "prometheus", Name: "Prometheus", Type: "prometheus", Access: "proxy",
		URL: "http://prom:9090", IsDefault: true,
		JSONData: map[string]any{"httpMethod": "POST"},
	}}
	if err := r.Reconcile(context.Background(), desired, nil); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if _, present := fake.store["cbdatasource"]; present {
		t.Errorf("cbdatasource should be deleted")
	}
	if _, present := fake.store["prometheus"]; !present {
		t.Errorf("prometheus should be created")
	}
}

func TestReconcile_PreservesClaimedDatasourceWithMissingConfig(t *testing.T) {
	// Hardening against deployer regressions: when the user has enabled
	// a feature (e.g. Prometheus) but the URL is empty (e.g. because
	// $PROMETHEUS_URL didn't reach Grafana's process env), the reconciler
	// must NOT delete a previously-good datasource. Empty URL → not in
	// desired; "claimed" tells the delete phase to leave the UID alone.
	fake := newFakeGrafana()
	fake.store["prometheus"] = map[string]any{
		"uid": "prometheus", "name": "Prometheus", "type": "prometheus",
		"access": "proxy", "url": "http://prom:9090", "readOnly": false,
	}
	srv := httptest.NewServer(fake.handler(t))
	defer srv.Close()

	r := newTestReconciler(srv)
	claimed := map[string]bool{dsUIDPrometheus: true} // feature enabled
	// desired is empty — URL was missing so desiredDatasources() skipped it.
	if err := r.Reconcile(context.Background(), []DesiredDatasource{}, claimed); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}

	if _, present := fake.store["prometheus"]; !present {
		t.Errorf("prometheus datasource was deleted despite being claimed; expected it preserved")
	}
	for _, req := range fake.requests {
		if req.method == http.MethodDelete && req.path == "/api/datasources/uid/prometheus" {
			t.Errorf("unexpected DELETE on claimed prometheus: %#v", req)
		}
	}
}

func TestClaimedDatasources_ReflectsEnabledFlags(t *testing.T) {
	// claimedDatasources() ignores URL/connection-string presence — it's
	// purely about user intent. Verifies the hardening pivot: "did the
	// user ask for this feature to be on?" rather than "is it currently
	// reconcilable?".
	cases := []struct {
		name string
		s    PluginSettings
		want map[string]bool
	}{
		{
			name: "both enabled, both URLs/strings empty",
			s: PluginSettings{
				PrometheusDatasource: PrometheusDatasourceSettings{Enabled: true},
				CouchbaseDatasource:  CouchbaseDatasourceSettings{Enabled: true},
			},
			want: map[string]bool{dsUIDPrometheus: true, dsUIDCouchbase: true},
		},
		{
			name: "prom enabled, couchbase disabled",
			s: PluginSettings{
				PrometheusDatasource: PrometheusDatasourceSettings{Enabled: true, URL: "http://x"},
				CouchbaseDatasource:  CouchbaseDatasourceSettings{Enabled: false},
			},
			want: map[string]bool{dsUIDPrometheus: true, dsUIDCouchbase: false},
		},
		{
			name: "neither enabled",
			s:    PluginSettings{},
			want: map[string]bool{dsUIDPrometheus: false, dsUIDCouchbase: false},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := tc.s.claimedDatasources()
			if got[dsUIDPrometheus] != tc.want[dsUIDPrometheus] || got[dsUIDCouchbase] != tc.want[dsUIDCouchbase] {
				t.Errorf("claimedDatasources() = %v, want %v", got, tc.want)
			}
		})
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
				CouchbaseDatasource:  CouchbaseDatasourceSettings{Enabled: true, Bucket: "cbmonitor"},
				CouchbaseServer:      CouchbaseServerSettings{ConnectionString: "couchbase://x"},
			},
			wantUIDs: []string{"prometheus", "cbdatasource"},
		},
		{
			name: "couchbase enabled but connection string missing — skipped",
			s: PluginSettings{
				CouchbaseDatasource: CouchbaseDatasourceSettings{Enabled: true, Bucket: "cbmonitor"},
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

func TestDesiredDatasources_PropagatesBucketScopeCollectionToCbdatasource(t *testing.T) {
	// The whole point of these settings is for panel queries (and any
	// UDFs) to know where the timeseries data lives. Verify they actually
	// land in the cbdatasource JSONData the reconciler sends to Grafana.
	s := PluginSettings{
		CouchbaseDatasource: CouchbaseDatasourceSettings{
			Enabled:    true,
			Bucket:     "metrics-bucket",
			Scope:      "metrics-scope",
			Collection: "timeseries",
		},
		CouchbaseServer: CouchbaseServerSettings{
			ConnectionString: "couchbase://cb",
			Username:         "u",
		},
	}
	got := s.desiredDatasources()
	if len(got) != 1 || got[0].UID != "cbdatasource" {
		t.Fatalf("expected exactly one cbdatasource desired entry, got %#v", got)
	}
	jd := got[0].JSONData
	if jd["bucket"] != "metrics-bucket" {
		t.Errorf("bucket not propagated, got %v", jd["bucket"])
	}
	if jd["scope"] != "metrics-scope" {
		t.Errorf("scope not propagated, got %v", jd["scope"])
	}
	if jd["collection"] != "timeseries" {
		t.Errorf("collection not propagated, got %v", jd["collection"])
	}
}

func TestDesiredDatasources_OmitsEmptyScopeCollection(t *testing.T) {
	// When scope/collection are blank (user wants defaults), the
	// JSONData shouldn't carry empty strings — the couchbase-datasource
	// plugin / UDFs should see them as absent, not as "" (which can
	// trigger different code paths).
	s := PluginSettings{
		CouchbaseDatasource: CouchbaseDatasourceSettings{
			Enabled: true,
			Bucket:  "metrics-bucket",
		},
		CouchbaseServer: CouchbaseServerSettings{
			ConnectionString: "couchbase://cb",
			Username:         "u",
		},
	}
	got := s.desiredDatasources()
	jd := got[0].JSONData
	if _, ok := jd["scope"]; ok {
		t.Errorf("scope should be omitted when blank, got %v", jd["scope"])
	}
	if _, ok := jd["collection"]; ok {
		t.Errorf("collection should be omitted when blank, got %v", jd["collection"])
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
