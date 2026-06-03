package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/couchbase/datasource-gateway/internal/couchbase"
	"github.com/couchbase/datasource-gateway/internal/router"
)

type fakeCouchbase struct {
	enabled bool
	md      *couchbase.Metadata
	err     error
	calls   int
}

func (f *fakeCouchbase) Enabled() bool { return f.enabled }
func (f *fakeCouchbase) Ready() bool   { return true }
func (f *fakeCouchbase) GetSnapshotMetadata(_ context.Context, _ string) (*couchbase.Metadata, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	return f.md, nil
}

type fakeProm struct{ proxy http.Handler }

func (f *fakeProm) URL() string                      { return "http://upstream" }
func (f *fakeProm) Reachable(_ context.Context) bool { return true }
func (f *fakeProm) ReverseProxy() http.Handler       { return f.proxy }

// recorder captures the params the reverse proxy received from the handler.
type recorder struct {
	called             bool
	start, end, query  string
}

func (rc *recorder) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rc.called = true
		_ = r.ParseForm()
		rc.start = r.Form.Get("start")
		rc.end = r.Form.Get("end")
		rc.query = r.Form.Get("query")
		w.WriteHeader(http.StatusOK)
	})
}

func newTestHandler(cb *fakeCouchbase, rc *recorder) *Handler {
	return NewHandler(cb, &fakeProm{proxy: rc.handler()}, router.New(cb))
}

func postQueryRange(h *Handler, query, start, end string) *httptest.ResponseRecorder {
	body := url.Values{"query": {query}, "start": {start}, "end": {end}, "step": {"15"}}.Encode()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/query_range", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.handleQueryRange(w, req)
	return w
}

func unixOf(t *testing.T, rfc string) string {
	t.Helper()
	ts, err := time.Parse(time.RFC3339, rfc)
	if err != nil {
		t.Fatalf("parse %q: %v", rfc, err)
	}
	return strconv.FormatInt(ts.Unix(), 10)
}

func TestQueryRangePrometheusBackedRewritesWindow(t *testing.T) {
	rc := &recorder{}
	cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{Store: "prometheus", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}}
	h := newTestHandler(cb, rc)

	// Deliberately-wrong dashboard range (1..2); expect it rewritten to the window.
	postQueryRange(h, `rate(kv_ops{job="snap-1"}[5m])`, "1", "2")

	if !rc.called {
		t.Fatal("expected passthrough to upstream for a Prometheus-backed snapshot")
	}
	if want := unixOf(t, "2024-01-02T00:00:00Z"); rc.start != want {
		t.Errorf("start = %q, want %q", rc.start, want)
	}
	if want := unixOf(t, "2024-01-02T01:00:00Z"); rc.end != want {
		t.Errorf("end = %q, want %q", rc.end, want)
	}
	if !strings.Contains(rc.query, "kv_ops") {
		t.Errorf("query not forwarded: %q", rc.query)
	}
}

func TestQueryRangeCouchbaseBackedReturnsStub(t *testing.T) {
	rc := &recorder{}
	cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{Store: "couchbase", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}}
	h := newTestHandler(cb, rc)

	w := postQueryRange(h, `rate(kv_ops{job="snap-1"}[5m])`, "1", "2")

	if rc.called {
		t.Error("Couchbase-backed query should not hit the passthrough")
	}
	if w.Code != http.StatusNotImplemented {
		t.Errorf("code = %d, want 501", w.Code)
	}
}

func TestQueryRangeOverlapForwardedUnchanged(t *testing.T) {
	rc := &recorder{}
	cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{Store: "couchbase"}}
	h := newTestHandler(cb, rc)

	postQueryRange(h, `rate(kv_ops{job=~"snap-1|snap-2"}[5m])`, "1000", "2000")

	if !rc.called {
		t.Fatal("overlap query should pass through")
	}
	if rc.start != "1000" || rc.end != "2000" {
		t.Errorf("overlap window rewritten: start=%q end=%q, want 1000/2000", rc.start, rc.end)
	}
	if cb.calls != 0 {
		t.Errorf("metadata consulted for overlap query: %d calls", cb.calls)
	}
}

func TestQueryRangeCouchbaseDisabledForwardsUnchanged(t *testing.T) {
	rc := &recorder{}
	cb := &fakeCouchbase{enabled: false}
	h := newTestHandler(cb, rc)

	postQueryRange(h, `rate(kv_ops{job="snap-1"}[5m])`, "1000", "2000")

	if !rc.called {
		t.Fatal("disabled-Couchbase query should pass through")
	}
	if rc.start != "1000" || rc.end != "2000" {
		t.Errorf("range rewritten while disabled: start=%q end=%q", rc.start, rc.end)
	}
	if cb.calls != 0 {
		t.Errorf("metadata consulted while disabled: %d calls", cb.calls)
	}
}
