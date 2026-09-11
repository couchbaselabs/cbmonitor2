package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/couchbase/datasource-gateway/internal/cbeval"
	"github.com/couchbase/datasource-gateway/internal/couchbase"
	"github.com/couchbase/datasource-gateway/internal/router"
)

type fakeCouchbase struct {
	enabled bool
	md      *couchbase.Metadata
	mdByID  map[string]*couchbase.Metadata
	err     error
	calls   int
}

func (f *fakeCouchbase) Enabled() bool { return f.enabled }
func (f *fakeCouchbase) Ready() bool   { return true }
func (f *fakeCouchbase) GetSnapshotMetadata(_ context.Context, id string) (*couchbase.Metadata, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	if md, ok := f.mdByID[id]; ok {
		return md, nil
	}
	return f.md, nil
}

// rangeCall records one upstream QueryRange call made by the overlap fan-out.
type rangeCall struct {
	query      string
	start, end time.Time
	step       string
}

// instantCall records one upstream instant Query call made by the overlap fan-out.
type instantCall struct {
	query string
	ts    time.Time
}

type fakeProm struct {
	proxy http.Handler
	// rangeBody maps the rewritten query to the upstream response body;
	// unmatched queries get an empty success matrix.
	rangeBody  map[string]string
	rangeCalls []rangeCall
	// instantBody maps the rewritten query to the upstream instant response
	// body; unmatched queries get an empty success vector.
	instantBody  map[string]string
	instantCalls []instantCall
	mu           sync.Mutex
}

func (f *fakeProm) URL() string                      { return "http://upstream" }
func (f *fakeProm) Reachable(_ context.Context) bool { return true }
func (f *fakeProm) ReverseProxy() http.Handler       { return f.proxy }
func (f *fakeProm) QueryRange(_ context.Context, query string, start, end time.Time, step string) ([]byte, int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.rangeCalls = append(f.rangeCalls, rangeCall{query: query, start: start, end: end, step: step})
	if body, ok := f.rangeBody[query]; ok {
		return []byte(body), http.StatusOK, nil
	}
	return []byte(`{"status":"success","data":{"resultType":"matrix","result":[]}}`), http.StatusOK, nil
}

func (f *fakeProm) Query(_ context.Context, query string, ts time.Time) ([]byte, int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.instantCalls = append(f.instantCalls, instantCall{query: query, ts: ts})
	if body, ok := f.instantBody[query]; ok {
		return []byte(body), http.StatusOK, nil
	}
	return []byte(`{"status":"success","data":{"resultType":"vector","result":[]}}`), http.StatusOK, nil
}

type fakeEvaluator struct {
	result     *cbeval.Result
	err        error
	called     bool
	gotQuery   string
	gotStart   time.Time
	gotEnd     time.Time
	gotStep    time.Duration
	instCalled bool
	instQuery  string
	instTS     time.Time
}

func (f *fakeEvaluator) RangeQuery(_ context.Context, query string, start, end time.Time, step time.Duration) (*cbeval.Result, error) {
	f.called = true
	f.gotQuery, f.gotStart, f.gotEnd, f.gotStep = query, start, end, step
	return f.result, f.err
}

func (f *fakeEvaluator) InstantQuery(_ context.Context, query string, ts time.Time) (*cbeval.Result, error) {
	f.instCalled = true
	f.instQuery, f.instTS = query, ts
	return f.result, f.err
}

// recorder captures the params the reverse proxy received from the handler.
type recorder struct {
	called            bool
	start, end, query string
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

func newTestHandler(cb *fakeCouchbase, rc *recorder, ev couchbaseEvaluator) *Handler {
	return newTestHandlerWithProm(cb, &fakeProm{proxy: rc.handler()}, ev)
}

func newTestHandlerWithProm(cb *fakeCouchbase, fp *fakeProm, ev couchbaseEvaluator) *Handler {
	return NewHandler(cb, fp, router.New(cb), ev)
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
	h := newTestHandler(cb, rc, &fakeEvaluator{})

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

func TestQueryRangeCouchbaseBackedRunsEvaluator(t *testing.T) {
	rc := &recorder{}
	cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{Store: "couchbase", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}}
	ev := &fakeEvaluator{result: &cbeval.Result{Status: "success"}}
	ev.result.Data.ResultType = "matrix"
	h := newTestHandler(cb, rc, ev)

	w := postQueryRange(h, `rate(kv_ops{job="snap-1"}[5m])`, "1", "2")

	if rc.called {
		t.Error("Couchbase-backed query should not hit the passthrough")
	}
	if !ev.called {
		t.Fatal("evaluator not called for a Couchbase-backed snapshot")
	}
	if w.Code != http.StatusOK {
		t.Errorf("code = %d, want 200", w.Code)
	}
	if !strings.Contains(ev.gotQuery, "kv_ops") {
		t.Errorf("query = %q", ev.gotQuery)
	}
	// Evaluated over the snapshot window, not the dashboard range (1..2).
	wantStart, _ := time.Parse(time.RFC3339, "2024-01-02T00:00:00Z")
	wantEnd, _ := time.Parse(time.RFC3339, "2024-01-02T01:00:00Z")
	if !ev.gotStart.Equal(wantStart) || !ev.gotEnd.Equal(wantEnd) {
		t.Errorf("window = [%v, %v], want [%v, %v]", ev.gotStart, ev.gotEnd, wantStart, wantEnd)
	}
	if ev.gotStep != 15*time.Second {
		t.Errorf("step = %v, want 15s", ev.gotStep)
	}
}

func TestQueryRangeCouchbaseEvaluatorErrorRendersEnvelope(t *testing.T) {
	cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{Store: "couchbase", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}}
	ev := &fakeEvaluator{err: errors.New("boom")}
	h := newTestHandler(cb, &recorder{}, ev)

	w := postQueryRange(h, `rate(kv_ops{job="snap-1"}[5m])`, "1", "2")

	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("code = %d, want 422", w.Code)
	}
	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp["status"] != "error" {
		t.Errorf("status = %q, want error", resp["status"])
	}
}

// overlapMetadata returns per-snapshot metadata for two Prometheus-backed
// snapshots with distinct one-hour windows a day apart.
func overlapMetadata(storeA, storeB string) map[string]*couchbase.Metadata {
	return map[string]*couchbase.Metadata{
		"snap-1": {Store: storeA, TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"},
		"snap-2": {Store: storeB, TSStart: "2024-01-03T00:00:00Z", TSEnd: "2024-01-03T02:00:00Z"},
	}
}

func decodeEnvelope(t *testing.T, w *httptest.ResponseRecorder) promEnvelope {
	t.Helper()
	var env promEnvelope
	if err := json.NewDecoder(w.Body).Decode(&env); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return env
}

func TestQueryRangeOverlapFansOutAndShifts(t *testing.T) {
	startA, _ := time.Parse(time.RFC3339, "2024-01-02T00:00:00Z")
	startB, _ := time.Parse(time.RFC3339, "2024-01-03T00:00:00Z")
	cb := &fakeCouchbase{enabled: true, mdByID: overlapMetadata("prometheus", "prometheus")}
	fp := &fakeProm{rangeBody: map[string]string{
		`rate(kv_ops{job="snap-1"}[5m])`: fmt.Sprintf(
			`{"status":"success","data":{"resultType":"matrix","result":[{"metric":{"job":"snap-1"},"values":[[%d,"1"],[%d,"2"]]}]}}`,
			startA.Unix(), startA.Unix()+15),
		`rate(kv_ops{job="snap-2"}[5m])`: fmt.Sprintf(
			`{"status":"success","data":{"resultType":"matrix","result":[{"metric":{"job":"snap-2"},"values":[[%d,"3"]]}]}}`,
			startB.Unix()),
	}}
	h := newTestHandlerWithProm(cb, fp, &fakeEvaluator{})

	w := postQueryRange(h, `rate(kv_ops{job=~"snap-1|snap-2"}[5m])`, "0", "7200")

	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, want 200", w.Code)
	}
	if len(fp.rangeCalls) != 2 {
		t.Fatalf("upstream calls = %d, want 2 (one per snapshot)", len(fp.rangeCalls))
	}
	for _, c := range fp.rangeCalls {
		switch {
		case strings.Contains(c.query, `job="snap-1"`):
			if !c.start.Equal(startA) {
				t.Errorf("snap-1 window start = %v, want %v", c.start, startA)
			}
		case strings.Contains(c.query, `job="snap-2"`):
			if !c.start.Equal(startB) {
				t.Errorf("snap-2 window start = %v, want %v", c.start, startB)
			}
		default:
			t.Errorf("unexpected upstream query %q", c.query)
		}
		if c.step != "15" {
			t.Errorf("step = %q, want request step 15", c.step)
		}
	}

	env := decodeEnvelope(t, w)
	if env.Status != "success" || env.Data.ResultType != "matrix" {
		t.Fatalf("envelope = %+v", env)
	}
	if len(env.Data.Result) != 2 {
		t.Fatalf("merged series = %d, want 2", len(env.Data.Result))
	}
	// Every sample must be shifted onto the 0-based axis.
	for _, s := range env.Data.Result {
		for _, v := range s.Values {
			ts, ok := v[0].(float64) // JSON numbers decode as float64
			if !ok || ts < 0 || ts > 7200 {
				t.Errorf("series %v sample ts = %v, want 0-based offset", s.Metric, v[0])
			}
		}
	}
}

func TestQueryRangeOverlapMixedStores(t *testing.T) {
	cb := &fakeCouchbase{enabled: true, mdByID: overlapMetadata("prometheus", "couchbase")}
	startB, _ := time.Parse(time.RFC3339, "2024-01-03T00:00:00Z")
	ev := &fakeEvaluator{result: &cbeval.Result{Status: "success"}}
	ev.result.Data.ResultType = "matrix"
	ev.result.Data.Result = []cbeval.SeriesJSON{{
		Metric: map[string]string{"job": "snap-2"},
		Values: [][]interface{}{{float64(startB.Unix() + 30), "7"}},
	}}
	fp := &fakeProm{}
	h := newTestHandlerWithProm(cb, fp, ev)

	w := postQueryRange(h, `kv_ops{job=~"snap-1|snap-2"}`, "0", "7200")

	if !ev.called {
		t.Fatal("Couchbase-backed leg should run through the evaluator")
	}
	if !strings.Contains(ev.gotQuery, `job="snap-2"`) {
		t.Errorf("evaluator query = %q, want single-snapshot matcher", ev.gotQuery)
	}
	if len(fp.rangeCalls) != 1 || !strings.Contains(fp.rangeCalls[0].query, `job="snap-1"`) {
		t.Fatalf("upstream calls = %+v, want exactly the snap-1 leg", fp.rangeCalls)
	}
	env := decodeEnvelope(t, w)
	// snap-1's leg returns the default empty matrix; snap-2 contributes one
	// series whose sample lands on the 0-based axis (start+30s -> 30).
	if len(env.Data.Result) != 1 {
		t.Fatalf("merged series = %d, want 1", len(env.Data.Result))
	}
	if ts, _ := env.Data.Result[0].Values[0][0].(float64); ts != 30 {
		t.Errorf("shifted ts = %v, want 30", env.Data.Result[0].Values[0][0])
	}
}

func TestQueryRangeOverlapNoWindowsReturnsError(t *testing.T) {
	rc := &recorder{}
	cb := &fakeCouchbase{enabled: false}
	h := newTestHandler(cb, rc, &fakeEvaluator{})

	w := postQueryRange(h, `rate(kv_ops{job=~"snap-1|snap-2"}[5m])`, "1000", "2000")

	if rc.called {
		t.Fatal("overlap with no evaluable leg must not fall through to the passthrough")
	}
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", w.Code)
	}
	env := decodeEnvelope(t, w)
	if env.Status != "error" || env.ErrorType != "execution" {
		t.Errorf("envelope = %+v, want an execution error", env)
	}
	for _, id := range []string{"snap-1", "snap-2"} {
		if !strings.Contains(env.Error, id) {
			t.Errorf("error %q does not name %s", env.Error, id)
		}
	}
}

func TestSplitJobs(t *testing.T) {
	cases := []struct {
		query string
		want  []string
	}{
		{`kv_ops{job="snap-1"}`, []string{"snap-1"}},
		{`kv_ops{job=~"snap-1|snap-2"}`, []string{"snap-1", "snap-2"}},
		{`kv_ops{job=~"snap\.1|snap-2"}`, []string{"snap.1", "snap-2"}},
		{`kv_ops{job=~"snap-1|snap-1|snap-2"}`, []string{"snap-1", "snap-2"}},
		{`kv_ops`, nil},
		{`kv_ops{job!="snap-1"}`, nil},
		// Labels that merely end in "job" are not the snapshot matcher.
		{`kv_ops{sub_job="x", job="snap-1"}`, []string{"snap-1"}},
		{`kv_ops{job=~"snap-1|snap-2", sub_job=~"a|b"}`, []string{"snap-1", "snap-2"}},
		{`kv_ops{sub_job="x"}`, nil},
	}
	for _, c := range cases {
		got := splitJobs(c.query)
		if len(got) != len(c.want) {
			t.Errorf("splitJobs(%q) = %v, want %v", c.query, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("splitJobs(%q) = %v, want %v", c.query, got, c.want)
				break
			}
		}
	}
}

func TestReplaceJobMatcherLeavesOtherLabelsAlone(t *testing.T) {
	got := replaceJobMatcher(`kv_ops{job=~"snap-1|snap-2", sub_job=~"a|b"}`, "snap-1")
	want := `kv_ops{job="snap-1", sub_job=~"a|b"}`
	if got != want {
		t.Errorf("replaceJobMatcher = %q, want %q", got, want)
	}
}

func postQuery(h *Handler, query string, extra url.Values) *httptest.ResponseRecorder {
	body := url.Values{"query": {query}}
	for k, vs := range extra {
		body[k] = vs
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/query", strings.NewReader(body.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.handleQuery(w, req)
	return w
}

func TestInstantQueryCouchbaseBackedEvaluatesAtWindowEnd(t *testing.T) {
	cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{Store: "couchbase", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}}
	ev := &fakeEvaluator{result: &cbeval.Result{Status: "success"}}
	ev.result.Data.ResultType = "vector"
	h := newTestHandler(cb, &recorder{}, ev)

	w := postQuery(h, `group by (instance) (sys_cpu{job="snap-1"})`, url.Values{"time": {"12345"}})

	if !ev.instCalled {
		t.Fatal("instant evaluator not called for Couchbase-backed snapshot")
	}
	wantEnd, _ := time.Parse(time.RFC3339, "2024-01-02T01:00:00Z")
	if !ev.instTS.Equal(wantEnd) {
		t.Errorf("eval ts = %v, want snapshot end %v (not the request's own time)", ev.instTS, wantEnd)
	}
	if w.Code != http.StatusOK {
		t.Errorf("code = %d, want 200", w.Code)
	}
}

func TestInstantQueryPrometheusBackedClampsTime(t *testing.T) {
	rc := &recorder{}
	timeRecorder := &recorder{}
	proxy := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rc.called = true
		_ = r.ParseForm()
		timeRecorder.start = r.Form.Get("time")
		w.WriteHeader(http.StatusOK)
	})
	cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{Store: "prometheus", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}}
	h := newTestHandlerWithProm(cb, &fakeProm{proxy: proxy}, &fakeEvaluator{})

	postQuery(h, `sys_cpu{job="snap-1"}`, url.Values{"time": {"12345"}})

	if !rc.called {
		t.Fatal("expected passthrough")
	}
	if want := unixOf(t, "2024-01-02T01:00:00Z"); timeRecorder.start != want {
		t.Errorf("time = %q, want snapshot end %q", timeRecorder.start, want)
	}
}

func TestInstantQueryOverlapEvaluatesAtEachWindowEnd(t *testing.T) {
	endA, _ := time.Parse(time.RFC3339, "2024-01-02T01:00:00Z")
	endB, _ := time.Parse(time.RFC3339, "2024-01-03T02:00:00Z")
	cb := &fakeCouchbase{enabled: true, mdByID: overlapMetadata("prometheus", "prometheus")}
	fp := &fakeProm{instantBody: map[string]string{
		`group by (instance) (sys_cpu{job="snap-1"})`: fmt.Sprintf(
			`{"status":"success","data":{"resultType":"vector","result":[{"metric":{"instance":"n1","job":"snap-1"},"value":[%d,"1"]}]}}`,
			endA.Unix()),
		`group by (instance) (sys_cpu{job="snap-2"})`: fmt.Sprintf(
			`{"status":"success","data":{"resultType":"vector","result":[{"metric":{"instance":"n2","job":"snap-2"},"value":[%d,"1"]}]}}`,
			endB.Unix()),
	}}
	h := newTestHandlerWithProm(cb, fp, &fakeEvaluator{})

	w := postQuery(h, `group by (instance) (sys_cpu{job=~"snap-1|snap-2"})`, nil)

	// Instant discovery must not become a full-window range query: long
	// snapshots would exceed the upstream's per-series point limit.
	if len(fp.rangeCalls) != 0 {
		t.Fatalf("upstream range calls = %d, want 0", len(fp.rangeCalls))
	}
	if len(fp.instantCalls) != 2 {
		t.Fatalf("upstream instant calls = %d, want 2", len(fp.instantCalls))
	}
	gotTS := map[string]time.Time{}
	for _, c := range fp.instantCalls {
		gotTS[c.query] = c.ts
	}
	if ts := gotTS[`group by (instance) (sys_cpu{job="snap-1"})`]; !ts.Equal(endA) {
		t.Errorf("snap-1 evaluated at %v, want window end %v", ts, endA)
	}
	if ts := gotTS[`group by (instance) (sys_cpu{job="snap-2"})`]; !ts.Equal(endB) {
		t.Errorf("snap-2 evaluated at %v, want window end %v", ts, endB)
	}

	env := decodeEnvelope(t, w)
	if env.Status != "success" || env.Data.ResultType != "vector" {
		t.Fatalf("envelope = %+v, want a success vector", env)
	}
	if len(env.Data.Result) != 2 {
		t.Fatalf("merged series = %d, want 2", len(env.Data.Result))
	}
	// Instant-style discovery keeps absolute timestamps (no 0-based shift).
	if ts, _ := env.Data.Result[0].Value[0].(float64); int64(ts) != endA.Unix() {
		t.Errorf("ts = %v, want absolute %d", env.Data.Result[0].Value[0], endA.Unix())
	}
}

func TestInstantQueryOverlapCouchbaseLegUsesInstantEvaluator(t *testing.T) {
	endA, _ := time.Parse(time.RFC3339, "2024-01-02T01:00:00Z")
	cb := &fakeCouchbase{enabled: true, mdByID: overlapMetadata("couchbase", "prometheus")}
	ev := &fakeEvaluator{result: &cbeval.Result{Status: "success"}}
	ev.result.Data.ResultType = "vector"
	ev.result.Data.Result = []cbeval.SeriesJSON{{
		Metric: map[string]string{"instance": "n1", "job": "snap-1"},
		Value:  []interface{}{float64(endA.Unix()), "1"},
	}}
	fp := &fakeProm{}
	h := newTestHandlerWithProm(cb, fp, ev)

	w := postQuery(h, `group by (instance) (sys_cpu{job=~"snap-1|snap-2"})`, nil)

	if ev.called {
		t.Error("Couchbase leg of an instant overlap query must not run a range query")
	}
	if !ev.instCalled || !ev.instTS.Equal(endA) {
		t.Fatalf("instant evaluator called=%v at %v, want window end %v", ev.instCalled, ev.instTS, endA)
	}
	env := decodeEnvelope(t, w)
	if len(env.Data.Result) != 1 || env.Data.Result[0].Value == nil {
		t.Fatalf("merged result = %+v, want the Couchbase vector sample carried through", env.Data.Result)
	}
}

func TestMetaEndpointRewritesWindowFromMatchers(t *testing.T) {
	rc := &recorder{}
	cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{Store: "prometheus", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}}
	h := newTestHandler(cb, rc, &fakeEvaluator{})

	body := url.Values{"match[]": {`{job="snap-1"}`}, "start": {"1"}, "end": {"2"}}.Encode()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/labels", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.handleMetaEndpoint(w, req)

	if !rc.called {
		t.Fatal("meta endpoint should pass through")
	}
	if want := unixOf(t, "2024-01-02T00:00:00Z"); rc.start != want {
		t.Errorf("start = %q, want snapshot window %q", rc.start, want)
	}
	if want := unixOf(t, "2024-01-02T01:00:00Z"); rc.end != want {
		t.Errorf("end = %q, want snapshot window %q", rc.end, want)
	}
}

func TestQueryRangeCouchbaseDisabledForwardsUnchanged(t *testing.T) {
	rc := &recorder{}
	cb := &fakeCouchbase{enabled: false}
	h := newTestHandler(cb, rc, &fakeEvaluator{})

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

// A request whose range already sits inside the snapshot, a phase selection or
// a drag-zoom, must be honoured. Substituting the full window would both
// override the user's selection and leave the client's step sized for the
// narrower range, overshooting the upstream's per-series point limit.
func TestQueryRangeKeepsRequestedRangeInsideWindow(t *testing.T) {
	rc := &recorder{}
	cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{
		Store: "prometheus", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T04:00:00Z",
	}}
	h := newTestHandler(cb, rc, &fakeEvaluator{})

	phaseStart := unixOf(t, "2024-01-02T02:00:00Z")
	phaseEnd := unixOf(t, "2024-01-02T02:10:00Z")
	postQueryRange(h, `up{job="snap-1"}`, phaseStart, phaseEnd)

	if rc.start != phaseStart || rc.end != phaseEnd {
		t.Errorf("requested in-window range was overridden: got [%s, %s], want [%s, %s]",
			rc.start, rc.end, phaseStart, phaseEnd)
	}
}

// A range that only partly overlaps the snapshot is clipped to the snapshot's bounds rather than replaced outright.
func TestQueryRangeClipsPartialOverlapToWindow(t *testing.T) {
	rc := &recorder{}
	cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{
		Store: "prometheus", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T04:00:00Z",
	}}
	h := newTestHandler(cb, rc, &fakeEvaluator{})

	// Starts an hour before the snapshot, ends two hours into it.
	postQueryRange(h, `up{job="snap-1"}`,
		unixOf(t, "2024-01-01T23:00:00Z"), unixOf(t, "2024-01-02T02:00:00Z"))

	if want := unixOf(t, "2024-01-02T00:00:00Z"); rc.start != want {
		t.Errorf("start = %q, want clipped to window start %q", rc.start, want)
	}
	if want := unixOf(t, "2024-01-02T02:00:00Z"); rc.end != want {
		t.Errorf("end = %q, want the requested end %q", rc.end, want)
	}
}

// A range entirely outside the snapshot is a stale or global time picker; the full snapshot window is the useful answer.
func TestQueryRangeOutsideWindowFallsBackToFullWindow(t *testing.T) {
	rc := &recorder{}
	cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{
		Store: "prometheus", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T04:00:00Z",
	}}
	h := newTestHandler(cb, rc, &fakeEvaluator{})

	postQueryRange(h, `up{job="snap-1"}`,
		unixOf(t, "2025-06-01T00:00:00Z"), unixOf(t, "2025-06-01T01:00:00Z"))

	if want := unixOf(t, "2024-01-02T00:00:00Z"); rc.start != want {
		t.Errorf("start = %q, want full window %q", rc.start, want)
	}
	if want := unixOf(t, "2024-01-02T04:00:00Z"); rc.end != want {
		t.Errorf("end = %q, want full window %q", rc.end, want)
	}
}

// A matcher whose alternation names one snapshot more than once still identifies that snapshot,
// so it must route on it rather than falling through unrouted.
func TestQueryRangeDuplicateJobAlternationStillRoutes(t *testing.T) {
	for _, matcher := range []string{`up{job=~"snap-1|snap-1"}`, `up{job=~"snap-1|"}`} {
		rc := &recorder{}
		cb := &fakeCouchbase{enabled: true, md: &couchbase.Metadata{
			Store: "prometheus", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z",
		}}
		h := newTestHandler(cb, rc, &fakeEvaluator{})

		postQueryRange(h, matcher, "1", "2")

		if want := unixOf(t, "2024-01-02T00:00:00Z"); rc.start != want {
			t.Errorf("%s: start = %q, want the snapshot window %q (query went unrouted)", matcher, rc.start, want)
		}
	}
}

// A snapshot that can't contribute to a comparison must say so: dropping the
// leg silently makes a missing run indistinguishable from one with no data.
func TestOverlapReportsDroppedLegAsWarning(t *testing.T) {
	fp := &fakeProm{proxy: (&recorder{}).handler()}
	cb := &fakeCouchbase{enabled: true, mdByID: map[string]*couchbase.Metadata{
		"snap-1": {Store: "prometheus", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"},
		// No parseable window: this leg cannot be evaluated.
		"snap-2": {Store: "prometheus", TSStart: "nonsense", TSEnd: "nonsense"},
	}}
	h := newTestHandlerWithProm(cb, fp, &fakeEvaluator{})

	w := postQueryRange(h, `up{job=~"snap-1|snap-2"}`, "1", "2")

	var env promEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(env.Warnings) == 0 {
		t.Fatal("expected a warning naming the dropped snapshot")
	}
	if !strings.Contains(strings.Join(env.Warnings, " "), "snap-2") {
		t.Errorf("warnings = %v, want one mentioning snap-2", env.Warnings)
	}
}
