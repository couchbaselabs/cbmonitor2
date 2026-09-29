package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/metrics"
	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/presets"
	"github.com/couchbase/config-manager/internal/products"
	"github.com/couchbase/config-manager/internal/storage"
)

// Handler handles HTTP requests for the config-manager service
type Handler struct {
	storage         *storage.FileStorage
	metadataStorage storage.MetadataStorage
	agentType       string
	collector       *metadataCollector
}

// NewHandler creates a new API handler
func NewHandler(storage *storage.FileStorage, metadataStorage storage.MetadataStorage, agentType string) *Handler {
	return &Handler{
		storage:         storage,
		metadataStorage: metadataStorage,
		agentType:       agentType,
		collector:       newMetadataCollector(metadataStorage),
	}
}

// Shutdown waits for background metadata collection until ctx ends, then
// cancels whatever is still running.
func (h *Handler) Shutdown(ctx context.Context) {
	h.collector.shutdown(ctx)
}

// CreateSnapshot handles POST /api/v1/snapshot
func (h *Handler) CreateSnapshot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body
	var req models.SnapshotRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate request
	if err := h.validateSnapshotRequest(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Convert cluster info to map for storage
	configs := make([]interface{}, len(req.Configs))
	for i, config := range req.Configs {
		configs[i] = map[string]interface{}{
			"hostnames":         config.Hostnames,
			"type":              config.Type,
			"port":              config.Port,
			"product":           config.Product,
			"sd_path":           config.SDPath,
			"scheme":            config.Scheme,
			"use_alt_addresses": config.UseAltAddresses,
		}
	}

	clusterMap := map[string]interface{}{
		"configs": configs,
		"credentials": map[string]interface{}{
			"username": req.Credentials.Username,
			"password": req.Credentials.Password,
		},
		"scheme": req.Scheme,
	}

	// Save snapshot to file
	id, err := h.storage.SaveSnapshot(clusterMap, h.agentType)
	if err != nil {
		http.Error(w, "Failed to save snapshot"+err.Error(), http.StatusInternalServerError)
		return
	}
	metrics.SnapshotsCreated.Inc()

	// The base document is written before responding: the gateway resolves a
	// snapshot's time window from ts_start, so it has to exist as soon as the
	// client starts querying. Cluster details (services, clusters, server
	// version) take one or more round trips per host and are collected in the
	// background, then merged in.
	metadataRecord := &models.SnapshotMetadata{
		SnapshotID:   id,
		TsStart:      time.Now(),
		TsEnd:        "now",
		Label:        req.Label,
		CustomPanels: presets.BuildCustomPanels(&req),
		Services:     []string{},
		Products:     collectProducts(req.Configs),
	}
	if err := h.metadataStorage.SaveMetadata(metadataRecord); err != nil {
		logger.Warn("Warning: Failed to save metadata", "error", err)
	} else {
		logger.Info("Successfully saved metadata for snapshot", "id", id, "customPanels", len(metadataRecord.CustomPanels))
	}
	h.collector.collect(metadataRecord, &req)

	// Create response
	response := models.SnapshotResponse{
		ID: id,
	}

	// Set response headers
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)

	// Write response
	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}
}

// collectProducts returns the distinct, order-preserving set of products
// across the request's configs. The validator has already defaulted each
// SD config's product to "couchbase", so a typical Couchbase snapshot
// yields ["couchbase"]; a mixed snapshot yields e.g.
// ["couchbase","syncgateway"].
// Blank products (e.g. a static config with no product) are skipped.
//
// A registered product's implied products follow it, so
// `product: "appservice"` yields ["appservice","syncgateway"].
func collectProducts(configs []models.ConfigObject) []string {
	seen := make(map[string]struct{}, len(configs))
	out := make([]string, 0, len(configs))
	add := func(name string) {
		if name == "" {
			return
		}
		if _, ok := seen[name]; ok {
			return
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}
	for _, c := range configs {
		add(c.Product)
		if p := products.Get(c.Product); p != nil {
			for _, implied := range p.Implies {
				add(implied)
			}
		}
	}
	return out
}

// validateSnapshotRequest validates the snapshot request
func (h *Handler) validateSnapshotRequest(req *models.SnapshotRequest) error {
	if req.Scheme == "" {
		req.Scheme = "http"
	} else if req.Scheme != "http" && req.Scheme != "https" {
		return &ValidationError{Field: "scheme", Message: "scheme must be either 'http' or 'https'"}
	}

	for i := range req.Configs {
		cfg := &req.Configs[i]

		if len(cfg.Hostnames) == 0 {
			return &ValidationError{Field: "configs.hostnames", Message: "at least one cluster/hostname is required"}
		}
		// TO DO: add validation to check against non existent Types
		if cfg.Type == "" {
			cfg.Type = "sd"
		}
		if cfg.Port == 0 {
			return &ValidationError{Field: "configs.port", Message: "port is required"}
		}

		// SD targets without an explicit product default to couchbase.
		// We need *some* path: either caller-supplied (sd_path) or
		// provided by the product registry. Reject when neither is set.
		if cfg.Type == "sd" {
			cfg.SDPath = strings.TrimSpace(cfg.SDPath)
			if cfg.Product == "" {
				cfg.Product = "couchbase"
			}
			if cfg.SDPath != "" && !strings.HasPrefix(cfg.SDPath, "/") {
				return &ValidationError{Field: "configs.sd_path", Message: "sd_path must start with '/'"}
			}
			if cfg.SDPath == "" {
				p := products.Get(cfg.Product)
				if p == nil || p.ResolveSDPath == nil {
					return &ValidationError{Field: "configs.sd_path", Message: fmt.Sprintf("sd_path is required (product %q has no default SD path)", cfg.Product)}
				}
			}
		}

		if cfg.Scheme == "" {
			cfg.Scheme = req.Scheme
		} else if cfg.Scheme != "http" && cfg.Scheme != "https" {
			return &ValidationError{Field: "configs.scheme", Message: "scheme must be either 'http' or 'https'"}
		}
	}

	if req.Credentials.Username == "" {
		return &ValidationError{Field: "credentials.username", Message: "username is required"}
	}

	if req.Credentials.Password == "" {
		return &ValidationError{Field: "credentials.password", Message: "password is required"}
	}

	return nil
}

// ValidationError represents a validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (e *ValidationError) Error() string {
	return e.Message
}
func (h *Handler) Manager(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.GetSnapshotRequest(w, r)
	case http.MethodDelete:
		h.DeleteSnapshotRequest(w, r)
	case http.MethodPatch:
		h.PatchSnapshotRequest(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) GetSnapshotRequest(w http.ResponseWriter, r *http.Request) {
	segments := strings.Split(r.URL.Path, "/")
	if len(segments) < 4 || segments[3] == "" {
		http.Error(w, "Missing snapshot ID", http.StatusBadRequest)
		return
	}

	snapshotID := segments[len(segments)-1]
	snapshot, err := h.storage.GetSnapshot(snapshotID)
	if err != nil {
		if strings.Contains(err.Error(), "config file does not exist") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(snapshot); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func (h *Handler) DeleteSnapshotRequest(w http.ResponseWriter, r *http.Request) {
	segments := strings.Split(r.URL.Path, "/")
	if len(segments) < 4 || segments[3] == "" {
		http.Error(w, "Missing snapshot ID", http.StatusBadRequest)
		return
	}

	snapshotID := segments[len(segments)-1]

	if err := h.metadataStorage.EoLSnapshot(snapshotID); err != nil {
		http.Error(w, "Failed to update end of life for snapshot metadata", http.StatusInternalServerError)
		return
	}

	if err := h.storage.DeleteSnapshot(snapshotID); err != nil {
		http.Error(w, "Failed to delete snapshot", http.StatusInternalServerError)
		// http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	metrics.SnapshotsDeleted.Inc()

	// Set response headers
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) PatchSnapshotRequest(w http.ResponseWriter, r *http.Request) {
	segments := strings.Split(r.URL.Path, "/")
	if len(segments) < 4 || segments[3] == "" {
		http.Error(w, "Missing snapshot ID", http.StatusBadRequest)
		return
	}

	snapshotID := segments[len(segments)-1]

	var payload struct {
		Phase    string   `json:"phase,omitempty"`
		Mode     string   `json:"mode,omitempty"`
		Services []string `json:"services,omitempty"`
	}

	if r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "Invalid payload request", http.StatusBadRequest)
			return
		}

		// Validate that at least one operation is requested
		hasPhaseUpdate := payload.Phase != "" && (payload.Mode == "start" || payload.Mode == "end")
		hasServiceUpdate := len(payload.Services) > 0

		// Handle phase update
		if hasPhaseUpdate {
			if err := h.metadataStorage.UpdatePhase(snapshotID, payload.Phase, payload.Mode); err != nil {
				http.Error(w, "Failed to update phase: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}

		// Handle services update
		if hasServiceUpdate {
			if err := h.metadataStorage.UpdateServices(snapshotID, payload.Services); err != nil {
				http.Error(w, "Failed to update services: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}

	if err := h.storage.PatchSnapshot(snapshotID); err != nil {
		http.Error(w, "Failed to patch snapshot: "+err.Error(), http.StatusInternalServerError)
		return
	}
	metrics.SnapshotsPatched.Inc()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

}
