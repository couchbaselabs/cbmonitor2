package manager

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/couchbase/config-manager/internal/metrics"
	"github.com/couchbase/config-manager/internal/storage"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

type endRecorder struct {
	mu    sync.Mutex
	ended map[string]time.Time
	apply bool
}

func (e *endRecorder) End(id string, at time.Time) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.ended[id] = at
	return e.apply
}

func (e *endRecorder) endedAt(id string) (time.Time, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	at, ok := e.ended[id]
	return at, ok
}

func writeSnapshot(t *testing.T, dir, id string, lastKeepalive time.Time) {
	t.Helper()
	path := filepath.Join(dir, id+".yml")
	if err := os.WriteFile(path, []byte("- job_name: "+id+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, lastKeepalive, lastKeepalive); err != nil {
		t.Fatal(err)
	}
}

func newSweeper(dir string, end *endRecorder, now time.Time) *Sweeper {
	return &Sweeper{
		Files:          storage.NewFileStorage(dir),
		End:            end.End,
		Interval:       10 * time.Millisecond,
		StaleThreshold: 5 * time.Minute,
		HoldPeriod:     6 * time.Hour,
		now:            func() time.Time { return now },
	}
}

func TestSweepExpiresStaleSnapshotsAndKeepsLiveOnes(t *testing.T) {
	dir := t.TempDir()
	now := time.Now()
	writeSnapshot(t, dir, "live", now.Add(-time.Minute))
	writeSnapshot(t, dir, "stale", now.Add(-10*time.Minute))
	end := &endRecorder{ended: map[string]time.Time{}, apply: true}
	s := newSweeper(dir, end, now)

	if err := s.Sweep(context.Background()); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(filepath.Join(dir, "live.yml")); err != nil {
		t.Errorf("live snapshot was swept: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "stale.yml")); !os.IsNotExist(err) {
		t.Errorf("stale snapshot is still being scraped: %v", err)
	}
	if !s.Files.IsHeld("stale") {
		t.Error("stale snapshot was not kept in the holding directory")
	}
	if at, ok := end.endedAt("stale"); !ok || !at.Equal(now) {
		t.Errorf("end of life recorded at %v (%v), want %v", at, ok, now)
	}
	if _, ok := end.endedAt("live"); ok {
		t.Error("end of life recorded for a live snapshot")
	}
	if got := testutil.ToFloat64(metrics.ActiveSnapshots); got != 1 {
		t.Errorf("active snapshots gauge = %v, want 1", got)
	}
}

// End-of-life failures are the queue's problem; the snapshot still stops
// being scraped.
func TestSweepExpiresEvenWhenEndOfLifeIsQueued(t *testing.T) {
	dir := t.TempDir()
	now := time.Now()
	writeSnapshot(t, dir, "stale", now.Add(-time.Hour))
	s := newSweeper(dir, &endRecorder{ended: map[string]time.Time{}, apply: false}, now)

	if err := s.Sweep(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "stale.yml")); !os.IsNotExist(err) {
		t.Errorf("stale snapshot still scraped after a queued end of life: %v", err)
	}
}

func TestSweepPurgesHeldSnapshotsPastTheHoldPeriod(t *testing.T) {
	dir := t.TempDir()
	fs := storage.NewFileStorage(dir)
	past := time.Now().Add(-7 * time.Hour)
	writeSnapshot(t, dir, "old", past)
	writeSnapshot(t, dir, "recent", past)
	if err := fs.Expire("old", past); err != nil {
		t.Fatal(err)
	}
	if err := fs.Expire("recent", time.Now()); err != nil {
		t.Fatal(err)
	}

	s := newSweeper(dir, &endRecorder{ended: map[string]time.Time{}}, time.Now())
	if err := s.Sweep(context.Background()); err != nil {
		t.Fatal(err)
	}
	if fs.IsHeld("old") {
		t.Error("held snapshot past its hold period was not purged")
	}
	if !fs.IsHeld("recent") {
		t.Error("held snapshot inside its hold period was purged")
	}
}

// Shutdown cancels a sweep between snapshots instead of waiting for every
// end of life to be recorded.
func TestSweepStopsWhenItsContextEnds(t *testing.T) {
	dir := t.TempDir()
	now := time.Now()
	writeSnapshot(t, dir, "stale", now.Add(-time.Hour))
	s := newSweeper(dir, &endRecorder{ended: map[string]time.Time{}, apply: true}, now)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := s.Sweep(ctx); err == nil {
		t.Error("a cancelled sweep reported success")
	}
	if _, err := os.Stat(filepath.Join(dir, "stale.yml")); err != nil {
		t.Errorf("a cancelled sweep expired a snapshot: %v", err)
	}
}

// The loop used to return on the first directory error and never run again,
// leaving stale scrape configs to pile up.
func TestRunSurvivesAFailedSweep(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "snapshots")
	end := &endRecorder{ended: map[string]time.Time{}, apply: true}
	s := newSweeper(dir, end, time.Time{})
	s.now = nil // real clock

	failuresBefore := testutil.ToFloat64(metrics.SweepFailures)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { defer close(done); s.Run(ctx) }()

	// The directory does not exist yet, so passes fail.
	time.Sleep(50 * time.Millisecond)
	if testutil.ToFloat64(metrics.SweepFailures) == failuresBefore {
		t.Error("failed sweeps were not counted")
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeSnapshot(t, dir, "stale", time.Now().Add(-time.Hour))
	deadline := time.Now().Add(2 * time.Second)
	for {
		if _, ok := end.endedAt("stale"); ok {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the loop stopped sweeping after a failed pass")
		}
		time.Sleep(10 * time.Millisecond)
	}
	// The heartbeat is published once the pass that expired it returns.
	for testutil.ToFloat64(metrics.SweepLastSuccess) == 0 {
		if time.Now().After(deadline) {
			t.Fatal("last successful sweep time was not published")
		}
		time.Sleep(10 * time.Millisecond)
	}

	cancel()
	<-done
}

func TestValidateTimings(t *testing.T) {
	m := time.Minute
	cases := []struct {
		name                     string
		interval, minimum, stale time.Duration
		ok                       bool
	}{
		{"the defaults", 5 * m, 5 * m, 5 * m, true},
		{"interval below the minimum", 2 * m, 5 * m, 5 * m, false},
		{"interval above 30m", 31 * m, 5 * m, 5 * m, false},
		{"stale threshold below 5m", 5 * m, 5 * m, 2 * m, false},
		{"stale threshold above 30m", 5 * m, 5 * m, 45 * m, false},
		{"upper bounds", 30 * m, 5 * m, 30 * m, true},
	}
	for _, c := range cases {
		err := ValidateTimings(c.interval, c.minimum, c.stale)
		if (err == nil) != c.ok {
			t.Errorf("%s: err = %v, want ok=%v", c.name, err, c.ok)
		}
	}
}
