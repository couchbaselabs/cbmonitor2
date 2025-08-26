package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/storage"
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
		"hostname": req.Hostname,
		"port":     req.Port,
		"credentials": map[string]interface{}{
			"username": req.Credentials.Username,
			"password": req.Credentials.Password,
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
	if req.Hostname == "" {
		return &ValidationError{Field: "hostname", Message: "hostname is required"}
	}

	if req.Port == 0 {
		return &ValidationError{Field: "port", Message: "port is required"}
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
	if err := h.storage.PatchSnapshot(snapshotID); err != nil {
		http.Error(w, "Failed to patch snapshot", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

}
