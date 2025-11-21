package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/services"
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

	// Collect cluster metadata
	metadataService := services.NewMetadataService()
	for _, config := range req.Configs {
		for _, hostname := range config.Hostnames {
			metadata, err := metadataService.CollectClusterMetadata(
				hostname,
				config.Port,
				req.Credentials.Username,
				req.Credentials.Password,
			)

			if err != nil {
				logger.Warn("Warning: Failed to collect cluster metadata", "error", err)
				// Continue without metadata - don't fail the snapshot creation
			} else {
				// Set the snapshot ID and label, then save metadata
				metadata.SnapshotID = id
				if req.Label != "" {
					metadata.Label = req.Label
				}
				if err := h.metadataStorage.SaveMetadata(metadata); err != nil {
					logger.Warn("Warning: Failed to save metadata", "error", err)
				} else {
					logger.Info("Successfully collected and saved metadata for snapshot", "id", id)
				}
			}
		}
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
		if len(req.Configs[i].Hostnames) == 0 {
			return &ValidationError{Field: "configs.hostnames", Message: "at least one cluster/hostname is required"}
		}
		// TO DO: add validation to check against non existent Types
		if req.Configs[i].Type == "" {
			req.Configs[i].Type = "sd"
		}
		if req.Configs[i].Port == 0 {
			return &ValidationError{Field: "configs.port", Message: "port is required"}
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

		if !hasPhaseUpdate && !hasServiceUpdate {
			http.Error(w, "At least one operation must be specified: phase update (phase + mode) or services update (services)", http.StatusBadRequest)
			return
		}

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

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

}
