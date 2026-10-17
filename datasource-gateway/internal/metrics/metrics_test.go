package metrics

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestInstrumentCountsByRouteAndCode(t *testing.T) {
	before := testutil.ToFloat64(HTTPRequests.WithLabelValues("query_range", "422"))
	h := Instrument("query_range", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/v1/query_range", nil))

	if got := testutil.ToFloat64(HTTPRequests.WithLabelValues("query_range", "422")) - before; got != 1 {
		t.Errorf("counted %v requests, want 1", got)
	}
}

// The reverse proxy flushes streamed responses through
// http.ResponseController, which must reach the real writer.
func TestInstrumentKeepsFlushing(t *testing.T) {
	rec := httptest.NewRecorder()
	h := Instrument("passthrough", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if err := http.NewResponseController(w).Flush(); err != nil {
			t.Errorf("flush through the instrumented writer: %v", err)
		}
	}))
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/status/buildinfo", nil))
	if !rec.Flushed {
		t.Error("the response was not flushed")
	}
}

func TestResultForStatus(t *testing.T) {
	for status, want := range map[int]string{0: "error", 200: "ok", 204: "ok", 400: "4xx", 422: "4xx", 502: "5xx"} {
		if got := ResultForStatus(status); got != want {
			t.Errorf("ResultForStatus(%d) = %q, want %q", status, got, want)
		}
	}
}
