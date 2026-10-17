package router

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	dto "github.com/prometheus/client_model/go"

	"github.com/couchbase/datasource-gateway/internal/couchbase"
	"github.com/couchbase/datasource-gateway/internal/metrics"
)

type fakeSource struct {
	enabled bool
	md      *couchbase.Metadata
	err     error
	block   chan struct{} // if non-nil, the fetch blocks on it
	started chan struct{} // if non-nil, signalled once as the fetch begins

	mu    sync.Mutex
	calls int
}

func (f *fakeSource) Enabled() bool { return f.enabled }

func (f *fakeSource) GetSnapshotMetadata(ctx context.Context, _ string) (*couchbase.Metadata, error) {
	f.mu.Lock()
	f.calls++
	first := f.calls == 1
	f.mu.Unlock()
	if f.started != nil && first {
		close(f.started)
	}
	if f.block != nil {
		<-f.block
	}
	// Mirror a real client: a cancelled context fails the fetch.
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if f.err != nil {
		return nil, f.err
	}
	return f.md, nil
}

func (f *fakeSource) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

func TestResolveExplicitPrometheusStore(t *testing.T) {
	f := &fakeSource{enabled: true, md: &couchbase.Metadata{Store: "prometheus", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}}
	rt := New(f).Resolve(context.Background(), "snap-1")
	if rt.Store != StorePrometheus {
		t.Errorf("store = %q, want prometheus", rt.Store)
	}
	if !rt.HasWindow {
		t.Error("expected a resolved window")
	}
}

func TestResolveDefaultsToPrometheusWhenStoreUnset(t *testing.T) {
	f := &fakeSource{enabled: true, md: &couchbase.Metadata{TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}}
	rt := New(f).Resolve(context.Background(), "snap-1")
	if rt.Store != StorePrometheus {
		t.Errorf("store = %q, want prometheus", rt.Store)
	}
	if !rt.HasWindow {
		t.Error("expected the metadata window to be resolved")
	}
}

func TestResolveDisabledFallsBackToPrometheus(t *testing.T) {
	f := &fakeSource{enabled: false}
	rt := New(f).Resolve(context.Background(), "snap-1")
	if rt.Store != StorePrometheus {
		t.Errorf("store = %q, want prometheus", rt.Store)
	}
	if f.callCount() != 0 {
		t.Errorf("metadata fetched while disabled: %d", f.callCount())
	}
}

func TestResolveCachesSuccessfulLookups(t *testing.T) {
	f := &fakeSource{enabled: true, md: &couchbase.Metadata{Store: "couchbase", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}}
	r := New(f)
	for i := 0; i < 5; i++ {
		r.Resolve(context.Background(), "snap-1")
	}
	if f.callCount() != 1 {
		t.Errorf("metadata fetched %d times, want 1 (cached)", f.callCount())
	}
}

func TestResolveDoesNotCacheErrors(t *testing.T) {
	f := &fakeSource{enabled: true, err: errors.New("not found")}
	r := New(f)
	rt := r.Resolve(context.Background(), "snap-1")
	r.Resolve(context.Background(), "snap-1")
	if f.callCount() != 2 {
		t.Errorf("error result was cached: calls = %d, want 2 (retried)", f.callCount())
	}
	if rt.Store != StorePrometheus {
		t.Errorf("error fallback store = %q, want prometheus", rt.Store)
	}
}

func TestResolveConcurrentSingleFetch(t *testing.T) {
	block := make(chan struct{})
	f := &fakeSource{enabled: true, md: &couchbase.Metadata{Store: "couchbase"}, block: block}
	r := New(f)

	const n = 20
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func() {
			defer wg.Done()
			r.Resolve(context.Background(), "snap-x")
		}()
	}
	time.Sleep(50 * time.Millisecond) // let all resolves reach the in-flight fetch
	close(block)                      // release the single fetch
	wg.Wait()

	if f.callCount() != 1 {
		t.Errorf("concurrent resolves triggered %d fetches, want 1", f.callCount())
	}
}

// A snapshot that is still running carries ts_end "now"; it must resolve to a
// usable window (ending about now) rather than being treated as windowless,
// otherwise it silently drops out of comparisons.
func TestResolveLiveSnapshotGetsWindow(t *testing.T) {
	for _, tsEnd := range []string{"now", "NOW", " now ", ""} {
		f := &fakeSource{enabled: true, md: &couchbase.Metadata{TSStart: "2024-01-02T00:00:00Z", TSEnd: tsEnd}}
		rt := New(f).Resolve(context.Background(), "snap-live")
		if !rt.HasWindow {
			t.Errorf("ts_end %q: expected a window", tsEnd)
			continue
		}
		if !rt.Live {
			t.Errorf("ts_end %q: expected Live to be true", tsEnd)
		}
		if rt.End.Before(rt.Start) {
			t.Errorf("ts_end %q: end %v precedes start %v", tsEnd, rt.End, rt.Start)
		}
	}
}

// A live snapshot's window keeps moving and its ts_end is rewritten at
// end-of-life, so the route must not be pinned for the cache TTL.
func TestResolveDoesNotCacheLiveSnapshots(t *testing.T) {
	f := &fakeSource{enabled: true, md: &couchbase.Metadata{TSStart: "2024-01-02T00:00:00Z", TSEnd: "now"}}
	r := New(f)
	r.Resolve(context.Background(), "snap-live")
	r.Resolve(context.Background(), "snap-live")
	if f.callCount() != 2 {
		t.Errorf("live route was cached: calls = %d, want 2 (re-resolved)", f.callCount())
	}
}

func TestResolveDoesNotCacheUnparseableWindow(t *testing.T) {
	f := &fakeSource{enabled: true, md: &couchbase.Metadata{TSStart: "not-a-time", TSEnd: "also-not"}}
	r := New(f)
	rt := r.Resolve(context.Background(), "snap-bad")
	r.Resolve(context.Background(), "snap-bad")
	if rt.HasWindow {
		t.Error("expected no window for unparseable timestamps")
	}
	if f.callCount() != 2 {
		t.Errorf("windowless route was cached: calls = %d, want 2 (retried)", f.callCount())
	}
}

// The shared metadata fetch must not inherit the first caller's cancellation:
// when one panel's request is cancelled mid-flight, every other panel waiting
// on the same snapshot would otherwise get the passthrough fallback.
func TestResolveSurvivesFirstCallerCancellation(t *testing.T) {
	block := make(chan struct{})
	started := make(chan struct{})
	f := &fakeSource{
		enabled: true,
		md:      &couchbase.Metadata{Store: "couchbase", TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"},
		block:   block,
		started: started,
	}
	r := New(f)

	// The cancelled caller must be the one that owns the shared fetch, so it
	// starts alone and the waiter only joins once the fetch is under way.
	cancelCtx, cancel := context.WithCancel(context.Background())
	var leader, waiter Route
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		leader = r.Resolve(cancelCtx, "snap-1")
	}()
	<-started

	wg.Add(1)
	go func() {
		defer wg.Done()
		waiter = r.Resolve(context.Background(), "snap-1")
	}()
	time.Sleep(50 * time.Millisecond) // the waiter reaches the in-flight fetch

	cancel()     // the owning request goes away, as a closed panel would
	close(block) // the shared fetch proceeds
	wg.Wait()

	if f.callCount() != 1 {
		t.Fatalf("fetches = %d, want 1 shared fetch", f.callCount())
	}
	for name, rt := range map[string]Route{"owner": leader, "waiter": waiter} {
		if rt.Store != StoreCouchbase {
			t.Errorf("%s: store = %q, want couchbase (cancellation leaked into the shared fetch)", name, rt.Store)
		}
		if !rt.HasWindow {
			t.Errorf("%s: expected the resolved window", name)
		}
	}
}

// Every decision is counted with the reason it was made, so a lookup that
// falls back without the snapshot's window shows up instead of passing
// silently.
func TestResolveCountsDecisionsByReason(t *testing.T) {
	finished := &couchbase.Metadata{TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}
	cases := []struct {
		name   string
		src    *fakeSource
		id     string
		store  Store
		reason string
	}{
		{"no snapshot", &fakeSource{enabled: true}, "", StorePrometheus, metrics.ReasonNoSnapshot},
		{"metadata disabled", &fakeSource{enabled: false}, "snap", StorePrometheus, metrics.ReasonCouchbaseDisabled},
		{"finished snapshot", &fakeSource{enabled: true, md: finished}, "snap", StorePrometheus, metrics.ReasonResolved},
		{"running snapshot", &fakeSource{enabled: true, md: &couchbase.Metadata{TSStart: "2024-01-02T00:00:00Z", TSEnd: "now"}}, "snap", StorePrometheus, metrics.ReasonLive},
		{"couchbase-backed", &fakeSource{enabled: true, md: &couchbase.Metadata{Store: "couchbase", TSStart: finished.TSStart, TSEnd: finished.TSEnd}}, "snap", StoreCouchbase, metrics.ReasonResolved},
		{"not a snapshot", &fakeSource{enabled: true, err: fmt.Errorf("%w: vmagent", couchbase.ErrSnapshotNotFound)}, "vmagent", StorePrometheus, metrics.ReasonNotFound},
		{"lookup failed", &fakeSource{enabled: true, err: errors.New("unambiguous timeout")}, "snap", StorePrometheus, metrics.ReasonLookupFailed},
		{"no window", &fakeSource{enabled: true, md: &couchbase.Metadata{TSStart: "garbage"}}, "snap", StorePrometheus, metrics.ReasonNoWindow},
	}
	for _, c := range cases {
		counter := metrics.RouteDecisions.WithLabelValues(string(c.store), c.reason)
		before := testutil.ToFloat64(counter)
		New(c.src).Resolve(context.Background(), c.id)
		if got := testutil.ToFloat64(counter) - before; got != 1 {
			t.Errorf("%s: counted %v decisions as %s/%s, want 1", c.name, got, c.store, c.reason)
		}
	}
}

func TestResolveCountsCacheHits(t *testing.T) {
	r := New(&fakeSource{enabled: true, md: &couchbase.Metadata{TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}})
	r.Resolve(context.Background(), "snap")
	hits := metrics.RouteDecisions.WithLabelValues(string(StorePrometheus), metrics.ReasonCacheHit)
	before := testutil.ToFloat64(hits)
	r.Resolve(context.Background(), "snap")
	if got := testutil.ToFloat64(hits) - before; got != 1 {
		t.Errorf("counted %v cache hits, want 1", got)
	}
	if r.CachedRoutes() != 1 {
		t.Errorf("CachedRoutes() = %d, want 1", r.CachedRoutes())
	}
}

func TestResolveTimesLookupsByResult(t *testing.T) {
	notFound := &fakeSource{enabled: true, err: fmt.Errorf("%w: x", couchbase.ErrSnapshotNotFound)}
	h := metrics.MetadataLookupDuration.WithLabelValues("not_found").(prometheus.Histogram)
	before := histogramCount(t, h)
	New(notFound).Resolve(context.Background(), "x")
	if got := histogramCount(t, h) - before; got != 1 {
		t.Errorf("timed %d lookups under result=not_found, want 1", got)
	}
}

func histogramCount(t *testing.T, h prometheus.Histogram) uint64 {
	t.Helper()
	var m dto.Metric
	if err := h.Write(&m); err != nil {
		t.Fatal(err)
	}
	return m.GetHistogram().GetSampleCount()
}
