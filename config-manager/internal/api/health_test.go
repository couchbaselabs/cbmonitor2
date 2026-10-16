package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/couchbase/config-manager/internal/storage"
)

func newHealth(t *testing.T, lastSweep time.Time) (*Health, *memMetadata) {
	t.Helper()
	dir := t.TempDir()
	pending, err := storage.NewPendingQueue(dir)
	if err != nil {
		t.Fatal(err)
	}
	md := newMemMetadata()
	return &Health{
		Dir:              dir,
		Storage:          md,
		Pending:          pending,
		SweepLastSuccess: func() time.Time { return lastSweep },
		SweepMaxAge:      11 * time.Minute,
		Started:          time.Now().Add(-time.Hour),
	}, md
}

func checkHealth(t *testing.T, hc *Health) (int, healthResponse) {
	t.Helper()
	rec := httptest.NewRecorder()
	hc.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))
	var resp healthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return rec.Code, resp
}

func TestHealthOK(t *testing.T) {
	hc, _ := newHealth(t, time.Now())
	code, resp := checkHealth(t, hc)
	if code != http.StatusOK || resp.Status != "ok" {
		t.Errorf("status %d %q, want 200 ok: %+v", code, resp.Status, resp.Checks)
	}
	// The probe file must not linger or reach vmagent.
	if matches, _ := filepath.Glob(filepath.Join(hc.Dir, "*.yml")); len(matches) != 0 {
		t.Errorf("health probe left scrape-visible files: %v", matches)
	}
}

// Registrations and keepalives keep working while metadata writes queue, so
// an unreachable store must not make a healthcheck restart the service.
func TestHealthIsDegradedNotFailingWhenTheStoreIsDown(t *testing.T) {
	hc, md := newHealth(t, time.Now())
	md.getErr = errors.New("unambiguous timeout")

	code, resp := checkHealth(t, hc)
	if code != http.StatusOK || resp.Status != "degraded" {
		t.Errorf("status %d %q, want 200 degraded", code, resp.Status)
	}
	if c := resp.Checks["metadata_store"]; c.OK || c.Error == "" {
		t.Errorf("metadata_store check = %+v, want the error reported", c)
	}
}

func TestHealthFailsWhenTheSweepHasStopped(t *testing.T) {
	hc, _ := newHealth(t, time.Now().Add(-time.Hour))
	if code, resp := checkHealth(t, hc); code != http.StatusServiceUnavailable || resp.Status != "failing" {
		t.Errorf("status %d %q, want 503 failing", code, resp.Status)
	}
}

func TestHealthToleratesTheFirstSweepAfterStartup(t *testing.T) {
	hc, _ := newHealth(t, time.Time{})
	hc.Started = time.Now()
	if code, _ := checkHealth(t, hc); code != http.StatusOK {
		t.Errorf("status %d right after startup, want 200", code)
	}

	hc.Started = time.Now().Add(-time.Hour)
	if code, _ := checkHealth(t, hc); code != http.StatusServiceUnavailable {
		t.Errorf("status %d with no sweep an hour after startup, want 503", code)
	}
}

func TestHealthFailsWhenTheSnapshotDirectoryIsNotWritable(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory permissions")
	}
	hc, _ := newHealth(t, time.Now())
	if err := os.Chmod(hc.Dir, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(hc.Dir, 0o700) })

	code, resp := checkHealth(t, hc)
	if code != http.StatusServiceUnavailable || resp.Checks["snapshot_directory"].OK {
		t.Errorf("status %d checks %+v, want 503 with the directory check failing", code, resp.Checks)
	}
}
