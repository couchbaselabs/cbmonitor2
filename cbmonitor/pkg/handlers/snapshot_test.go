package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/couchbase/cbmonitor/pkg/models"
)

// fakeSnapshotService is a minimal in-memory snapshotFetcher for tests.
type fakeSnapshotService struct {
	byID           map[string]*models.SnapshotData
	err            error
	invalidatedIDs []string
}

func (f *fakeSnapshotService) GetSnapshotByID(_ context.Context, id string) (*models.SnapshotData, error) {
	if f.err != nil {
		return nil, f.err
	}
	if data, ok := f.byID[id]; ok {
		return data, nil
	}
	return nil, fmt.Errorf("snapshot not found: %s", id)
}

func (f *fakeSnapshotService) InvalidateCache(id string) {
	f.invalidatedIDs = append(f.invalidatedIDs, id)
}

// fakeMetricSource records what it was called with and returns canned
// points or an error.
type fakeMetricSource struct {
	called    bool
	gotReq    metricRequest
	points    []models.MetricDataPoint
	returnErr error
}

func (f *fakeMetricSource) Fetch(_ context.Context, req metricRequest) ([]models.MetricDataPoint, error) {
	f.called = true
	f.gotReq = req
	if f.returnErr != nil {
		return nil, f.returnErr
	}
	return f.points, nil
}

func newTestHandler(t *testing.T, defaultDS string, snap *fakeSnapshotService, cb, prom metricSource) *SnapshotHandler {
	t.Helper()
	h := NewSnapshotHandler(nil, nil, nil, func() string { return defaultDS }, "")
	// Inject our snapshotFetcher stub manually (NewSnapshotHandler takes
	// the concrete *services.SnapshotService, not the interface).
	if snap != nil {
		h.snapshotService = snap
	}
	if cb != nil {
		h.couchbaseSource = cb
	}
	if prom != nil {
		h.prometheusSource = prom
	}
	return h
}

func sampleSnapshotData() *models.SnapshotData {
	return &models.SnapshotData{
		Metadata: models.SnapshotMetadata{
			SnapshotID: "snap-1",
			TSStart:    "2025-01-01T00:00:00Z",
			TSEnd:      "2025-01-01T01:00:00Z",
			Phases: []models.Phase{
				{Label: "access", TSStart: "2025-01-01T00:10:00Z", TSEnd: "2025-01-01T00:40:00Z"},
			},
		},
	}
}

func TestHandleGetSnapshot_success(t *testing.T) {
	snap := &fakeSnapshotService{byID: map[string]*models.SnapshotData{"snap-1": sampleSnapshotData()}}
	h := newTestHandler(t, "couchbase", snap, nil, nil)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1", nil)
	h.HandleGetSnapshot(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if len(snap.invalidatedIDs) != 0 {
		t.Errorf("expected no cache invalidation on a plain GET, got %v", snap.invalidatedIDs)
	}
}

func TestHandleGetSnapshot_refreshParamInvalidatesCache(t *testing.T) {
	snap := &fakeSnapshotService{byID: map[string]*models.SnapshotData{"snap-1": sampleSnapshotData()}}
	h := newTestHandler(t, "couchbase", snap, nil, nil)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1?refresh=true", nil)
	h.HandleGetSnapshot(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if len(snap.invalidatedIDs) != 1 || snap.invalidatedIDs[0] != "snap-1" {
		t.Errorf("expected InvalidateCache(\"snap-1\") to be called once, got %v", snap.invalidatedIDs)
	}
}

func TestHandleGetMetric_couchbaseRoute(t *testing.T) {
	fakeCB := &fakeMetricSource{points: []models.MetricDataPoint{{Time: "2025-01-01T00:00:00Z", Value: 1.0}}}
	fakeProm := &fakeMetricSource{}
	h := newTestHandler(t, "couchbase", nil, fakeCB, fakeProm)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops?bucket=default", nil)
	h.HandleGetMetric(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if !fakeCB.called || fakeProm.called {
		t.Fatalf("expected couchbase source to be called, got cb=%v prom=%v", fakeCB.called, fakeProm.called)
	}
	if fakeCB.gotReq.LabelFilters["bucket"] != "default" {
		t.Errorf("label filter not passed through: %+v", fakeCB.gotReq.LabelFilters)
	}

	var resp models.MetricDataResponse
	mustDecode(t, rec.Body.String(), &resp)
	if !resp.Success || resp.Count != 1 {
		t.Errorf("unexpected response: %+v", resp)
	}
}

func TestHandleGetMetric_prometheusRoute(t *testing.T) {
	snap := &fakeSnapshotService{byID: map[string]*models.SnapshotData{"snap-1": sampleSnapshotData()}}
	fakeCB := &fakeMetricSource{}
	fakeProm := &fakeMetricSource{points: []models.MetricDataPoint{{Time: "2025-01-01T00:00:00Z", Value: 42}}}
	h := newTestHandler(t, "prometheus", snap, fakeCB, fakeProm)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops?bucket=default&step=30s", nil)
	h.HandleGetMetric(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if !fakeProm.called || fakeCB.called {
		t.Fatalf("expected prometheus source to be called, got cb=%v prom=%v", fakeCB.called, fakeProm.called)
	}
	if fakeProm.gotReq.Step != 30*time.Second {
		t.Errorf("step not parsed: %v", fakeProm.gotReq.Step)
	}
	wantStart, _ := time.Parse(time.RFC3339, "2025-01-01T00:00:00Z")
	if !fakeProm.gotReq.Start.Equal(wantStart) {
		t.Errorf("start = %v, want %v", fakeProm.gotReq.Start, wantStart)
	}
	if fakeProm.gotReq.LabelFilters["bucket"] != "default" {
		t.Errorf("label filter not passed through: %+v", fakeProm.gotReq.LabelFilters)
	}
}

func TestHandleGetMetricPhase_prometheusUsesPhaseWindow(t *testing.T) {
	snap := &fakeSnapshotService{byID: map[string]*models.SnapshotData{"snap-1": sampleSnapshotData()}}
	fakeProm := &fakeMetricSource{}
	h := newTestHandler(t, "prometheus", snap, nil, fakeProm)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops/phases/access", nil)
	h.HandleGetMetricPhase(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	wantStart, _ := time.Parse(time.RFC3339, "2025-01-01T00:10:00Z")
	wantEnd, _ := time.Parse(time.RFC3339, "2025-01-01T00:40:00Z")
	if !fakeProm.gotReq.Start.Equal(wantStart) || !fakeProm.gotReq.End.Equal(wantEnd) {
		t.Errorf("phase window mismatch: start=%v end=%v want=%v..%v",
			fakeProm.gotReq.Start, fakeProm.gotReq.End, wantStart, wantEnd)
	}
	if fakeProm.gotReq.PhaseName != "access" {
		t.Errorf("phase name = %q, want %q", fakeProm.gotReq.PhaseName, "access")
	}
}

func TestHandleGetMetric_prometheusServiceUnavailable(t *testing.T) {
	// prometheus source returns the typed unavailable error.
	snap := &fakeSnapshotService{byID: map[string]*models.SnapshotData{"snap-1": sampleSnapshotData()}}
	fakeProm := &fakeMetricSource{returnErr: errMetricSourceUnavailable("prometheus metrics service is not available")}
	h := newTestHandler(t, "prometheus", snap, nil, fakeProm)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops", nil)
	h.HandleGetMetric(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", rec.Code)
	}
}

func TestHandleGetMetric_prometheusMissingStepIsOK(t *testing.T) {
	snap := &fakeSnapshotService{byID: map[string]*models.SnapshotData{"snap-1": sampleSnapshotData()}}
	fakeProm := &fakeMetricSource{}
	h := newTestHandler(t, "prometheus", snap, nil, fakeProm)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops", nil)
	h.HandleGetMetric(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if fakeProm.gotReq.Step != 15*time.Second {
		t.Errorf("default step = %v, want 15s", fakeProm.gotReq.Step)
	}
}

func TestHandleGetMetric_prometheusMalformedStep(t *testing.T) {
	snap := &fakeSnapshotService{byID: map[string]*models.SnapshotData{"snap-1": sampleSnapshotData()}}
	fakeProm := &fakeMetricSource{}
	h := newTestHandler(t, "prometheus", snap, nil, fakeProm)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops?step=15z", nil)
	h.HandleGetMetric(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	if fakeProm.called {
		t.Error("source should not have been called for bad step")
	}
}

func TestHandleGetMetric_couchbaseIgnoresBadStep(t *testing.T) {
	// On the Couchbase path step is silently ignored.
	fakeCB := &fakeMetricSource{}
	h := newTestHandler(t, "couchbase", nil, fakeCB, nil)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops?step=15z", nil)
	h.HandleGetMetric(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200 (step ignored on couchbase path)", rec.Code)
	}
}

func TestHandleGetMetric_prometheusSnapshotNotFound(t *testing.T) {
	snap := &fakeSnapshotService{byID: map[string]*models.SnapshotData{}}
	fakeProm := &fakeMetricSource{}
	h := newTestHandler(t, "prometheus", snap, nil, fakeProm)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/missing/metrics/kv_ops", nil)
	h.HandleGetMetric(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}

func TestHandleGetMetricPhase_promPhaseMissingFallsBackToSnapshotWindow(t *testing.T) {
	// An unknown phase name falls back to the full snapshot window.
	snap := &fakeSnapshotService{byID: map[string]*models.SnapshotData{"snap-1": sampleSnapshotData()}}
	fakeProm := &fakeMetricSource{}
	h := newTestHandler(t, "prometheus", snap, nil, fakeProm)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops/phases/nonexistent", nil)
	h.HandleGetMetricPhase(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	wantStart, _ := time.Parse(time.RFC3339, "2025-01-01T00:00:00Z")
	if !fakeProm.gotReq.Start.Equal(wantStart) {
		t.Errorf("expected fallback to snapshot window; got start=%v", fakeProm.gotReq.Start)
	}
}

func TestHandleGetMetricSummary_emptyResult(t *testing.T) {
	fakeCB := &fakeMetricSource{points: nil}
	h := newTestHandler(t, "couchbase", nil, fakeCB, nil)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops/summary", nil)
	h.HandleGetMetricSummary(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	var resp models.MetricSummaryResponse
	mustDecode(t, rec.Body.String(), &resp)
	if !resp.Success || resp.Summary == nil || resp.Summary.Count != 0 {
		t.Errorf("expected empty summary, got %+v", resp.Summary)
	}
	if resp.Summary.Percentiles == nil {
		t.Error("percentiles map should be initialised (not nil)")
	}
}

func TestHandleGetMetricSummary_defaultsAndCustom(t *testing.T) {
	points := []models.MetricDataPoint{
		{Time: "t1", Value: 10},
		{Time: "t2", Value: 20},
		{Time: "t3", Value: 30},
		{Time: "t4", Value: 40},
		{Time: "t5", Value: 50},
	}
	fakeCB := &fakeMetricSource{points: points}
	h := newTestHandler(t, "couchbase", nil, fakeCB, nil)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops/summary?percentiles=0.95", nil)
	h.HandleGetMetricSummary(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	var resp models.MetricSummaryResponse
	mustDecode(t, rec.Body.String(), &resp)
	for _, key := range []string{"0.5", "0.9", "0.99", "0.95"} {
		if _, ok := resp.Summary.Percentiles[key]; !ok {
			t.Errorf("missing percentile %q in %+v", key, resp.Summary.Percentiles)
		}
	}
	if resp.Summary.Min != 10 || resp.Summary.Max != 50 || resp.Summary.Avg != 30 {
		t.Errorf("bad stats: min=%v max=%v avg=%v", resp.Summary.Min, resp.Summary.Max, resp.Summary.Avg)
	}
}

func TestHandleGetMetric_invalidPath(t *testing.T) {
	h := newTestHandler(t, "couchbase", nil, &fakeMetricSource{}, nil)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/notmetrics/foo", nil)
	h.HandleGetMetric(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}

func TestHandleGetMetric_prometheusNilSnapshotServiceFallsBackToDefaultWindow(t *testing.T) {
	fakeProm := &fakeMetricSource{}
	h := newTestHandler(t, "prometheus", nil, nil, fakeProm)
	h.snapshotService = nil

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops", nil)
	before := time.Now().UTC()
	h.HandleGetMetric(rec, req)
	after := time.Now().UTC()

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if !fakeProm.called {
		t.Fatal("expected prometheus source to be called with fallback window")
	}
	assertFallbackWindow(t, fakeProm.gotReq.Start, fakeProm.gotReq.End, before, after)
}

func TestHandleGetMetric_prometheusMetadataTransientErrorFallsBack(t *testing.T) {
	snap := &fakeSnapshotService{err: fmt.Errorf("couchbase: connection refused")}
	fakeProm := &fakeMetricSource{}
	h := newTestHandler(t, "prometheus", snap, nil, fakeProm)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops", nil)
	before := time.Now().UTC()
	h.HandleGetMetric(rec, req)
	after := time.Now().UTC()

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if !fakeProm.called {
		t.Fatal("expected prometheus source to be called on transient metadata failure")
	}
	assertFallbackWindow(t, fakeProm.gotReq.Start, fakeProm.gotReq.End, before, after)
}

func TestHandleGetMetric_prometheusUnparseableTimestampsFallBack(t *testing.T) {
	bad := &models.SnapshotData{
		Metadata: models.SnapshotMetadata{
			SnapshotID: "snap-1",
			TSStart:    "not-a-timestamp",
			TSEnd:      "also-bad",
		},
	}
	snap := &fakeSnapshotService{byID: map[string]*models.SnapshotData{"snap-1": bad}}
	fakeProm := &fakeMetricSource{}
	h := newTestHandler(t, "prometheus", snap, nil, fakeProm)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops", nil)
	before := time.Now().UTC()
	h.HandleGetMetric(rec, req)
	after := time.Now().UTC()

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	assertFallbackWindow(t, fakeProm.gotReq.Start, fakeProm.gotReq.End, before, after)
}

func TestHandleGetMetricPhase_unparseablePhaseTimestampsFallBackToSnapshotWindow(t *testing.T) {
	data := &models.SnapshotData{
		Metadata: models.SnapshotMetadata{
			SnapshotID: "snap-1",
			TSStart:    "2025-01-01T00:00:00Z",
			TSEnd:      "2025-01-01T01:00:00Z",
			Phases: []models.Phase{
				{Label: "access", TSStart: "bogus", TSEnd: "also-bogus"},
			},
		},
	}
	snap := &fakeSnapshotService{byID: map[string]*models.SnapshotData{"snap-1": data}}
	fakeProm := &fakeMetricSource{}
	h := newTestHandler(t, "prometheus", snap, nil, fakeProm)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/snapshots/snap-1/metrics/kv_ops/phases/access", nil)
	h.HandleGetMetricPhase(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	wantStart, _ := time.Parse(time.RFC3339, "2025-01-01T00:00:00Z")
	wantEnd, _ := time.Parse(time.RFC3339, "2025-01-01T01:00:00Z")
	if !fakeProm.gotReq.Start.Equal(wantStart) || !fakeProm.gotReq.End.Equal(wantEnd) {
		t.Errorf("expected snapshot-window fallback for bad phase; got %v..%v", fakeProm.gotReq.Start, fakeProm.gotReq.End)
	}
}

// assertFallbackWindow checks that [start,end] looks like a
// defaultFallbackWindow-wide range ending at "now". Allows a small slop
// to absorb the time elapsed between the handler call and the test
// reading wall clock.
func assertFallbackWindow(t *testing.T, start, end, before, after time.Time) {
	t.Helper()
	const slop = 2 * time.Second
	if end.Before(before.Add(-slop)) || end.After(after.Add(slop)) {
		t.Errorf("fallback end = %v, want within [%v, %v]", end, before, after)
	}
	got := end.Sub(start)
	if got < defaultFallbackWindow-slop || got > defaultFallbackWindow+slop {
		t.Errorf("fallback window = %v, want ~%v", got, defaultFallbackWindow)
	}
}

func mustDecode(t *testing.T, body string, v interface{}) {
	t.Helper()
	if err := json.NewDecoder(strings.NewReader(body)).Decode(v); err != nil {
		t.Fatalf("decode: %v; body=%s", err, body)
	}
}
