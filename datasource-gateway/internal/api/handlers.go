package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/couchbase/datasource-gateway/internal/router"
)

// couchbaseHealth is the slice of the Couchbase client the health endpoint
// needs. Snapshot-metadata lookups for routing live behind the router.
type couchbaseHealth interface {
	Enabled() bool
	Ready() bool
}

// prometheusGateway is the slice of the Prometheus client the gateway needs:
// health probing plus the reverse-proxy handler for the passthrough path.
type prometheusGateway interface {
	URL() string
	Reachable(ctx context.Context) bool
	ReverseProxy() http.Handler
}

// Handler holds the gateway HTTP handlers: the health endpoint and the
// Prometheus-compatible API surface (/api/v1/*).
type Handler struct {
	couchbase  couchbaseHealth
	prometheus prometheusGateway
	router     *router.Router
}

// NewHandler constructs the gateway HTTP handler.
func NewHandler(couchbase couchbaseHealth, prometheus prometheusGateway, router *router.Router) *Handler {
	return &Handler{couchbase: couchbase, prometheus: prometheus, router: router}
}

// Register wires the handler's routes onto the given mux: the gateway's own
// /healthz; /api/v1/query_range (routed per snapshot); and a catch-all
// /api/v1/ streaming reverse proxy for every other Prometheus-API endpoint.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/healthz", h.Health)
	if h.prometheus != nil {
		mux.HandleFunc("/api/v1/query_range", h.handleQueryRange)
		mux.Handle("/api/v1/", h.prometheus.ReverseProxy())
	}
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

func prometheusStatus(ctx context.Context, prom prometheusGateway) map[string]any {
	if prom == nil {
		return map[string]any{"configured": false}
	}
	return map[string]any{"url": prom.URL(), "reachable": prom.Reachable(ctx)}
}
