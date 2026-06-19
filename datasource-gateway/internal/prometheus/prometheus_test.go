package prometheus

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestReverseProxyForwardsToUpstream verifies the /api/v1 surface forwards
// requests to the upstream Prometheus, preserving the path (joined onto the
// upstream's prefix) and query, and relaying the response.
func TestReverseProxyForwardsToUpstream(t *testing.T) {
	var gotPath, gotQuery string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"status":"success","data":{"resultType":"scalar","result":[1700000000,"1"]}}`)
	}))
	defer upstream.Close()

	// Upstream behind a /prometheus prefix, mimicking Mimir.
	c := New(upstream.URL + "/prometheus")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/query?query=1", nil)
	rec := httptest.NewRecorder()
	c.ReverseProxy().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if want := "/prometheus/api/v1/query"; gotPath != want {
		t.Errorf("upstream path = %q, want %q", gotPath, want)
	}
	if !strings.Contains(gotQuery, "query=1") {
		t.Errorf("upstream query = %q, want it to contain query=1", gotQuery)
	}
	var resp map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if resp["status"] != "success" {
		t.Errorf("relayed status = %v, want success", resp["status"])
	}
}

// TestReverseProxyUpstreamDownReturnsPromError verifies that an unreachable
// upstream produces a Prometheus error envelope (not plain text), so Grafana's
// Prometheus datasource gets a parseable response.
func TestReverseProxyUpstreamDownReturnsPromError(t *testing.T) {
	c := New("http://127.0.0.1:0/prometheus") // unroutable

	req := httptest.NewRequest(http.MethodGet, "/api/v1/query?query=1", nil)
	rec := httptest.NewRecorder()
	c.ReverseProxy().ServeHTTP(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
	var resp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if resp["status"] != "error" {
		t.Errorf("status = %q, want error", resp["status"])
	}
}
