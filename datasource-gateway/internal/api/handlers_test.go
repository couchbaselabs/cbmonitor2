package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// /metrics is served on the gateway's own mux, and the query routes are
// counted under their fixed route label.
func TestRegisterServesMetricsAndCountsRoutes(t *testing.T) {
	mux := http.NewServeMux()
	newTestHandler(&fakeCouchbase{}, &recorder{}, nil).Register(mux)

	body := url.Values{"query": {"up"}, "start": {"0"}, "end": {"60"}, "step": {"15"}}.Encode()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/query_range", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	mux.ServeHTTP(httptest.NewRecorder(), req)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("/metrics status %d", rec.Code)
	}
	out, _ := io.ReadAll(rec.Body)
	for _, want := range []string{
		`datasource_gateway_http_requests_total{code="200",route="query_range"}`,
		`datasource_gateway_route_decisions_total{reason="no_snapshot",store="prometheus"}`,
		`go_goroutines`,
	} {
		if !strings.Contains(string(out), want) {
			t.Errorf("/metrics is missing %s", want)
		}
	}
}
