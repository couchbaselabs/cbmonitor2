package api

import (
	"encoding/json"
	"net/http"
)

// Handler holds the gateway HTTP handlers. It is intentionally minimal for
// now; the Prometheus-compatible query routes (/api/v1/*) and the routing /
// translation dependencies are added in subsequent tasks.
type Handler struct{}

// NewHandler constructs the gateway HTTP handler.
func NewHandler() *Handler {
	return &Handler{}
}

// Register wires the handler's routes onto the given mux. This is the seam
// the Prometheus-API routes attach to in a later task.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/healthz", h.Health)
}

// Health reports service liveness.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
