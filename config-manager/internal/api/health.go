package api

import (
	"encoding/json"
	"net/http"
	"os"
	"time"

	"github.com/couchbase/config-manager/internal/storage"
)

// Health serves GET /health.
//
// It answers 503 only when config-manager cannot do its job: the snapshot
// directory is not writable, or the sweep has stopped (nothing else stops
// scraping for a client that died). An unreachable metadata store answers 200
// with status "degraded": registrations and keepalives still work and metadata
// writes queue, so a container healthcheck must not restart the service for it.
type Health struct {
	Dir     string
	Storage storage.MetadataStorage
	Pending *storage.PendingQueue
	// SweepLastSuccess reports the last completed sweep; zero before the first.
	SweepLastSuccess func() time.Time
	// SweepMaxAge is how old the last sweep may be before the sweep counts as
	// stopped.
	SweepMaxAge time.Duration
	Started     time.Time
}

type healthCheck struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
	// Detail carries check-specific context, such as the sweep's age.
	Detail map[string]interface{} `json:"detail,omitempty"`
}

type healthResponse struct {
	Status                string                 `json:"status"` // "ok" | "degraded" | "failing"
	Checks                map[string]healthCheck `json:"checks"`
	PendingMetadataWrites int                    `json:"pending_metadata_writes"`
}

func (hc *Health) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	now := time.Now()
	resp := healthResponse{Status: "ok", Checks: map[string]healthCheck{}}
	fail := func(name string, c healthCheck, critical bool) {
		resp.Checks[name] = c
		if critical {
			resp.Status = "failing"
		} else if resp.Status == "ok" {
			resp.Status = "degraded"
		}
	}

	if err := probeWritable(hc.Dir); err != nil {
		fail("snapshot_directory", healthCheck{Error: err.Error()}, true)
	} else {
		resp.Checks["snapshot_directory"] = healthCheck{OK: true}
	}

	last := hc.SweepLastSuccess()
	sweep := healthCheck{OK: true, Detail: map[string]interface{}{}}
	switch {
	case last.IsZero() && now.Sub(hc.Started) <= hc.SweepMaxAge:
		sweep.Detail["state"] = "starting"
	case last.IsZero():
		fail("sweep", healthCheck{Error: "no sweep has completed since startup"}, true)
	case now.Sub(last) > hc.SweepMaxAge:
		fail("sweep", healthCheck{Error: "the last sweep is older than " + hc.SweepMaxAge.String(),
			Detail: map[string]interface{}{"last_success": last.UTC().Format(time.RFC3339)}}, true)
	default:
		sweep.Detail["last_success"] = last.UTC().Format(time.RFC3339)
	}
	if _, failed := resp.Checks["sweep"]; !failed {
		resp.Checks["sweep"] = sweep
	}

	store := healthCheck{OK: true, Detail: map[string]interface{}{"type": hc.Storage.Type()}}
	if err := hc.Storage.Ping(); err != nil {
		store.OK, store.Error = false, err.Error()
		fail("metadata_store", store, false)
	} else {
		resp.Checks["metadata_store"] = store
	}

	resp.PendingMetadataWrites = hc.Pending.Len()

	w.Header().Set("Content-Type", "application/json")
	if resp.Status == "failing" {
		w.WriteHeader(http.StatusServiceUnavailable)
	} else {
		w.WriteHeader(http.StatusOK)
	}
	if r.Method == http.MethodGet {
		_ = json.NewEncoder(w).Encode(resp)
	}
}

// probeWritable creates and removes a file in dir. The name ends in ".tmp" so
// vmagent's "*.yml" glob never sees it.
func probeWritable(dir string) error {
	f, err := os.CreateTemp(dir, ".health-*.tmp")
	if err != nil {
		return err
	}
	name := f.Name()
	f.Close()
	return os.Remove(name)
}
