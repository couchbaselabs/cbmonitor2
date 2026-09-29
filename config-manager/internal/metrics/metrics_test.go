package metrics

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestInstrumentCountsRequestsByStatus(t *testing.T) {
	h := Instrument("test_route", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/missing" {
			http.Error(w, "nope", http.StatusNotFound)
			return
		}
		_, _ = w.Write([]byte("ok")) // implicit 200
	}))

	before200 := testutil.ToFloat64(HTTPRequests.WithLabelValues("test_route", "GET", "200"))
	before404 := testutil.ToFloat64(HTTPRequests.WithLabelValues("test_route", "GET", "404"))
	for _, path := range []string{"/", "/", "/missing"} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, path, nil))
	}

	if got := testutil.ToFloat64(HTTPRequests.WithLabelValues("test_route", "GET", "200")) - before200; got != 2 {
		t.Errorf("200s counted = %v, want 2", got)
	}
	if got := testutil.ToFloat64(HTTPRequests.WithLabelValues("test_route", "GET", "404")) - before404; got != 1 {
		t.Errorf("404s counted = %v, want 1", got)
	}
	if n := testutil.CollectAndCount(HTTPDuration, "config_manager_http_request_duration_seconds"); n == 0 {
		t.Error("request latency not observed")
	}
}

func TestInstrumentBoundsTheMethodLabel(t *testing.T) {
	h := Instrument("test_methods", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("BREW", "/", nil))
	if got := testutil.ToFloat64(HTTPRequests.WithLabelValues("test_methods", "other", "200")); got != 1 {
		t.Errorf("unknown method counted as %v under \"other\", want 1", got)
	}
}
