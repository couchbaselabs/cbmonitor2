package router

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/couchbase/datasource-gateway/internal/couchbase"
)

type fakeSource struct {
	enabled bool
	md      *couchbase.Metadata
	err     error
	block   chan struct{} // if non-nil, the fetch blocks on it

	mu    sync.Mutex
	calls int
}

func (f *fakeSource) Enabled() bool { return f.enabled }

func (f *fakeSource) GetSnapshotMetadata(_ context.Context, _ string) (*couchbase.Metadata, error) {
	f.mu.Lock()
	f.calls++
	f.mu.Unlock()
	if f.block != nil {
		<-f.block
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

func TestResolveDefaultsToCouchbaseWhenStoreUnset(t *testing.T) {
	f := &fakeSource{enabled: true, md: &couchbase.Metadata{TSStart: "2024-01-02T00:00:00Z", TSEnd: "2024-01-02T01:00:00Z"}}
	rt := New(f).Resolve(context.Background(), "snap-1")
	if rt.Store != StoreCouchbase {
		t.Errorf("store = %q, want couchbase", rt.Store)
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
