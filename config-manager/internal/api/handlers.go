package api

import (
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
}

// NewHandler creates a new API handler
func NewHandler(storage *storage.FileStorage, metadataStorage storage.MetadataStorage, agentType string) *Handler {
	return &Handler{
		storage:         storage,
		metadataStorage: metadataStorage,
		agentType:       agentType,
	}
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
			"hostnames": config.Hostnames,
			"type":      config.Type,
			"port":      config.Port,
			"product":   config.Product,
			"sd_path":   config.SDPath,
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

	// Collect per-product metadata via the registry. Configs whose
	// product is unknown (or has no GetMetadata) are skipped quietly —
	// non-Couchbase SD targets and static lists shouldn't generate
	// warning logs from doomed HTTP calls.
	serviceSet := make(map[string]struct{})
	clusterSet := make(map[string]models.Cluster)
	metadataRecord := &models.SnapshotMetadata{
		SnapshotID:   id,
		TsStart:      time.Now(),
		TsEnd:        "now",
		Label:        req.Label,
		CustomPanels: presets.BuildCustomPanels(&req),
		Services:     []string{},
	}
	hasMetadata := false

	for _, config := range req.Configs {
		product := products.Get(config.Product)
		if product == nil || product.GetMetadata == nil {
			continue
		}
		for _, hostname := range config.Hostnames {
			metadata, err := product.GetMetadata(
				req.Scheme,
				hostname,
				config.Port,
				req.Credentials.Username,
				req.Credentials.Password,
			)
			if err != nil {
				logger.Warn("Warning: Failed to collect product metadata", "product", config.Product, "error", err)
				continue
			}
			if metadata == nil {
				continue
			}
			hasMetadata = true

			for _, service := range metadata.Services {
				serviceSet[service] = struct{}{}
			}

			for _, cluster := range metadata.Clusters {
				clusterKey := cluster.UID
				if clusterKey == "" {
					clusterKey = "name|" + cluster.Name
				}
				if clusterKey == "" {
					continue
				}

				if existing, ok := clusterSet[clusterKey]; ok {
					if existing.Name == "" && cluster.Name != "" {
						existing.Name = cluster.Name
					}
					if len(existing.Targets) == 0 && len(cluster.Targets) > 0 {
						existing.Targets = append([]string(nil), cluster.Targets...)
					}
					clusterSet[clusterKey] = existing
					continue
				}

				clusterSet[clusterKey] = cluster
			}

			if metadataRecord.Server == "" && metadata.Server != "" {
				metadataRecord.Server = metadata.Server
			}

			// Free-form per-product blob. Last-write-wins per key; the
			// convention is to namespace keys (e.g. `couchbase_version`,
			// `sgw_version`) so distinct products don't collide.
			if len(metadata.Extras) > 0 {
				if metadataRecord.Extras == nil {
					metadataRecord.Extras = make(map[string]interface{}, len(metadata.Extras))
				}
				for k, v := range metadata.Extras {
					metadataRecord.Extras[k] = v
				}
			}
		}
	}

	if hasMetadata {
		metadataRecord.Services = make([]string, 0, len(serviceSet))
		for service := range serviceSet {
			metadataRecord.Services = append(metadataRecord.Services, service)
		}

		metadataRecord.Clusters = make([]models.Cluster, 0, len(clusterSet))
		for _, cluster := range clusterSet {
			metadataRecord.Clusters = append(metadataRecord.Clusters, cluster)
		}

		// Assign default names to clusters without names (after merge)
		for i := range metadataRecord.Clusters {
			if metadataRecord.Clusters[i].Name == "" {
				metadataRecord.Clusters[i].Name = fmt.Sprintf("cluster%d", i+1)
			}
		}
	}

	// Persist the metadata document for every snapshot so the label and
	// timestamps always land in the bucket. When no product contributed
	// cluster metadata and no custom panels were requested, services/
	// clusters stay empty and the frontend falls back to its
	// alwaysInclude builtins for that snapshot.
	if err := h.metadataStorage.SaveMetadata(metadataRecord); err != nil {
		logger.Warn("Warning: Failed to save metadata", "error", err)
	} else {
		logger.Info("Successfully saved metadata for snapshot", "id", id, "hasClusterMetadata", hasMetadata, "customPanels", len(metadataRecord.CustomPanels))
	}

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

// validateSnapshotRequest validates the snapshot request
func (h *Handler) validateSnapshotRequest(req *models.SnapshotRequest) error {
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
	}

	if req.Credentials.Username == "" {
		return &ValidationError{Field: "credentials.username", Message: "username is required"}
	}

	if req.Credentials.Password == "" {
		return &ValidationError{Field: "credentials.password", Message: "password is required"}
	}

	if req.Scheme == "" {
		req.Scheme = "http"
	} else if req.Scheme != "http" && req.Scheme != "https" {
		return &ValidationError{Field: "scheme", Message: "scheme must be either 'http' or 'https'"}
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
