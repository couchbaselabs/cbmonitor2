package api

import (
	"encoding/json"
	"net/http"

	"github.com/couchbase/cbmonitor/internal/config-manager/models"
	"github.com/couchbase/cbmonitor/internal/config-manager/storage"
)

// Handler handles HTTP requests for the config-manager service
type Handler struct {
	storage   *storage.FileStorage
	agentType string
}

// NewHandler creates a new API handler
func NewHandler(storage *storage.FileStorage, agentType string) *Handler {
	return &Handler{
		storage:   storage,
		agentType: agentType,
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
	clusterMap := map[string]interface{}{
		"hostname":    req.ClusterInfo.Hostname,
		"port":        req.ClusterInfo.Port,
		"credentials": map[string]interface{}{
			"username": req.ClusterInfo.Credentials.Username,
			"password": req.ClusterInfo.Credentials.Password,
		},
	}

	// Save snapshot to file
	id, err := h.storage.SaveSnapshot(clusterMap, h.agentType)
	if err != nil {
		http.Error(w, "Failed to save snapshot", http.StatusInternalServerError)
		return
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
	if req.ClusterInfo.Hostname == "" {
		return &ValidationError{Field: "cluster_info.hostname", Message: "hostname is required"}
	}

	if req.ClusterInfo.Port == 0 {
		return &ValidationError{Field: "cluster_info.port", Message: "port is required"}
	}

	if req.ClusterInfo.Credentials.Username == "" {
		return &ValidationError{Field: "cluster_info.credentials.username", Message: "username is required"}
	}

	if req.ClusterInfo.Credentials.Password == "" {
		return &ValidationError{Field: "cluster_info.credentials.password", Message: "password is required"}
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
