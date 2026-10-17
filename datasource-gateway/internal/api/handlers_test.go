package api

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"

	"github.com/couchbase/datasource-gateway/internal/couchbase"
	"github.com/couchbase/datasource-gateway/internal/metrics"
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

// A comparison over more than six snapshots is cut, and a snapshot without a
// window drops out of it; both were silent before.
func TestOverlapCountsTruncationAndFailedLegs(t *testing.T) {
	md := map[string]*couchbase.Metadata{}
	ids := []string{}
	for i := 1; i <= 7; i++ {
		id := fmt.Sprintf("snap-%d", i)
		ids = append(ids, id)
		md[id] = &couchbase.Metadata{TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}
	}
	md["snap-2"] = &couchbase.Metadata{TSStart: "not a time"}
	h := newTestHandlerWithProm(&fakeCouchbase{enabled: true, mdByID: md}, &fakeProm{}, &fakeEvaluator{})

	requests, truncated, failed := testutil.ToFloat64(metrics.OverlapRequests),
		testutil.ToFloat64(metrics.OverlapTruncated), testutil.ToFloat64(metrics.OverlapLegFailures)
	if w := postQueryRange(h, `up{job=~"`+strings.Join(ids, "|")+`"}`, "0", "3600"); w.Code != http.StatusOK {
		t.Fatalf("status %d", w.Code)
	}
	if got := testutil.ToFloat64(metrics.OverlapRequests) - requests; got != 1 {
		t.Errorf("overlap requests = %v, want 1", got)
	}
	if got := testutil.ToFloat64(metrics.OverlapTruncated) - truncated; got != 1 {
		t.Errorf("truncated = %v, want 1 for seven snapshots", got)
	}
	if got := testutil.ToFloat64(metrics.OverlapLegFailures) - failed; got != 1 {
		t.Errorf("leg failures = %v, want 1 for the snapshot without a window", got)
	}
}

// A range moved into the snapshot's window, and a step raised to fit it, are
// counted: they explain a graph coarser or shifted from what was asked for.
func TestClampedWindowsAndFlooredStepsAreCounted(t *testing.T) {
	cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{TSStart: "2024-01-01T00:00:00Z", TSEnd: "2024-01-04T00:00:00Z"}}
	h := newTestHandler(cb, &recorder{}, &fakeEvaluator{})
	clampedRange := metrics.WindowClamped.WithLabelValues("range")
	clamped, floored := testutil.ToFloat64(clampedRange), testutil.ToFloat64(metrics.StepFloored)

	// Inside the window: neither.
	postQueryRange(h, `up{job="snap-1"}`, unixOf(t, "2024-01-02T00:00:00Z"), unixOf(t, "2024-01-02T01:00:00Z"))
	if testutil.ToFloat64(clampedRange) != clamped || testutil.ToFloat64(metrics.StepFloored) != floored {
		t.Fatal("a request inside the window was counted as clamped or floored")
	}
	// A stale time picker: the 72 h window replaces it, and 15 s steps over
	// 72 h exceed the point limit.
	postQueryRange(h, `up{job="snap-1"}`, unixOf(t, "2025-06-01T00:00:00Z"), unixOf(t, "2025-06-01T01:00:00Z"))
	if got := testutil.ToFloat64(clampedRange) - clamped; got != 1 {
		t.Errorf("clamped ranges = %v, want 1", got)
	}
	if got := testutil.ToFloat64(metrics.StepFloored) - floored; got != 1 {
		t.Errorf("floored steps = %v, want 1", got)
	}

	clampedInstant := metrics.WindowClamped.WithLabelValues("instant")
	before := testutil.ToFloat64(clampedInstant)
	postQuery(h, `up{job="snap-1"}`, url.Values{"time": {unixOf(t, "2025-06-01T00:00:00Z")}})
	if got := testutil.ToFloat64(clampedInstant) - before; got != 1 {
		t.Errorf("clamped instants = %v, want 1", got)
	}
}

// An instant comparison sends no step upstream, so it never floors one.
func TestInstantComparisonDoesNotFloorTheStep(t *testing.T) {
	md := map[string]*couchbase.Metadata{
		"snap-1": {TSStart: "2024-01-01T00:00:00Z", TSEnd: "2024-01-04T00:00:00Z"},
		"snap-2": {TSStart: "2024-02-01T00:00:00Z", TSEnd: "2024-02-04T00:00:00Z"},
	}
	h := newTestHandlerWithProm(&fakeCouchbase{enabled: true, mdByID: md}, &fakeProm{}, &fakeEvaluator{})
	floored := testutil.ToFloat64(metrics.StepFloored)
	postQuery(h, `up{job=~"snap-1|snap-2"}`, url.Values{"step": {"15"}})
	if got := testutil.ToFloat64(metrics.StepFloored) - floored; got != 0 {
		t.Errorf("an instant comparison of 72 h snapshots floored %v steps, want 0", got)
	}
}
