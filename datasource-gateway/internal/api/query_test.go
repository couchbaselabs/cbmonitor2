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

func (f *fakeProm) URL() string                       { return "http://upstream" }
func (f *fakeProm) Reachable(_ context.Context) bool  { return true }
func (f *fakeProm) ReverseProxy() http.Handler        { return f.proxy }

// recorder captures the params the reverse proxy received from the handler.
type recorder struct{ start, end, query string }

func (rc *recorder) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		rc.start = r.Form.Get("start")
		rc.end = r.Form.Get("end")
		rc.query = r.Form.Get("query")
		w.WriteHeader(http.StatusOK)
	})
}

func unixOf(t *testing.T, rfc string) string {
	t.Helper()
	ts, err := time.Parse(time.RFC3339, rfc)
	if err != nil {
		t.Fatalf("parse %q: %v", rfc, err)
	}
	return strconv.FormatInt(ts.Unix(), 10)
}

func postQueryRange(h *Handler, query, start, end string) *recorder {
	rc := &recorder{}
	// Re-point the handler's proxy at the recorder for this call.
	h.prometheus = &fakeProm{proxy: rc.handler()}
	body := url.Values{"query": {query}, "start": {start}, "end": {end}, "step": {"15"}}.Encode()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/query_range", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	h.handleQueryRange(httptest.NewRecorder(), req)
	return rc
}

func TestQueryRangeRewritesSingleSnapshotWindow(t *testing.T) {
	cb := &fakeCouchbase{
		enabled: true,
		md:      &couchbase.Metadata{ID: "snap-1", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"},
	}
	h := NewHandler(cb, &fakeProm{})

	// Deliberately-wrong dashboard range (1..2); expect it rewritten to the window.
	rc := postQueryRange(h, `rate(kv_ops{job="snap-1"}[5m])`, "1", "2")

	if want := unixOf(t, "2024-01-02T00:00:00Z"); rc.start != want {
		t.Errorf("start = %q, want %q", rc.start, want)
	}
	if want := unixOf(t, "2024-01-02T01:00:00Z"); rc.end != want {
		t.Errorf("end = %q, want %q", rc.end, want)
	}
	if !strings.Contains(rc.query, "kv_ops") {
		t.Errorf("query not forwarded: %q", rc.query)
	}
	if cb.calls != 1 {
		t.Errorf("metadata lookups = %d, want 1", cb.calls)
	}
}

func TestQueryRangeMultiSnapshotForwardedUnchanged(t *testing.T) {
	cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}}
	h := NewHandler(cb, &fakeProm{})

	// Overlap query (multiple jobs) → no rewrite; original range + query survive
	// the POST-body reconstruction.
	rc := postQueryRange(h, `rate(kv_ops{job=~"snap-1|snap-2"}[5m])`, "1000", "2000")

	if rc.start != "1000" || rc.end != "2000" {
		t.Errorf("range rewritten for overlap: start=%q end=%q, want 1000/2000", rc.start, rc.end)
	}
	if !strings.Contains(rc.query, "snap-1|snap-2") {
		t.Errorf("query not forwarded intact: %q", rc.query)
	}
	if cb.calls != 0 {
		t.Errorf("metadata looked up for overlap query (%d calls); should be skipped", cb.calls)
	}
}

func TestQueryRangeCouchbaseDisabledForwardsUnchanged(t *testing.T) {
	cb := &fakeCouchbase{enabled: false}
	h := NewHandler(cb, &fakeProm{})

	rc := postQueryRange(h, `rate(kv_ops{job="snap-1"}[5m])`, "1000", "2000")

	if rc.start != "1000" || rc.end != "2000" {
		t.Errorf("range rewritten while disabled: start=%q end=%q", rc.start, rc.end)
	}
	if cb.calls != 0 {
		t.Errorf("metadata looked up while disabled (%d calls)", cb.calls)
	}
}
