package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// couchbaseHealth is the slice of the Couchbase client the health endpoint
// needs. Behind an interface so the api package stays decoupled from the
// concrete client (and testable).
type couchbaseHealth interface {
	Enabled() bool
	Ready() bool
}

// prometheusHealth is the slice of the Prometheus client the health endpoint
// needs.
type prometheusHealth interface {
	URL() string
	Reachable(ctx context.Context) bool
}

// Handler holds the gateway HTTP handlers. The Prometheus-compatible query
// routes (/api/v1/*) attach to this in a later task.
type Handler struct {
	couchbase  couchbaseHealth
	prometheus prometheusHealth
}

// NewHandler constructs the gateway HTTP handler.
func NewHandler(couchbase couchbaseHealth, prometheus prometheusHealth) *Handler {
	return &Handler{couchbase: couchbase, prometheus: prometheus}
}

// Register wires the handler's routes onto the given mux. This is the seam
// the Prometheus-API routes attach to in a later task.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/healthz", h.Health)
}

// Health reports liveness (always HTTP 200) with per-dependency status in the
// body, mirroring the plugin's connection-healthcheck convention.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()

	resp := map[string]any{
		"status":     "ok",
		"couchbase":  couchbaseStatus(h.couchbase),
		"prometheus": prometheusStatus(ctx, h.prometheus),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func couchbaseStatus(cb couchbaseHealth) map[string]any {
	if cb == nil || !cb.Enabled() {
		return map[string]any{"enabled": false}
	}
	return map[string]any{"enabled": true, "ready": cb.Ready()}
}

func prometheusStatus(ctx context.Context, prom prometheusHealth) map[string]any {
	if prom == nil {
		return map[string]any{"configured": false}
	}
	return map[string]any{"url": prom.URL(), "reachable": prom.Reachable(ctx)}
}
