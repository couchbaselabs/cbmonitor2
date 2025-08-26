package tests

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/couchbase/config-manager/internal/api"
	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/storage"
)

func TestGetSnapshotRequest(t *testing.T) {
	tempDir := t.TempDir()

	// Initialize storage and handler
	fileStorage := storage.NewFileStorage(tempDir)
	handler := api.NewHandler(fileStorage, "vmagent")

	// Create a snapshot to retrieve
	request := models.SnapshotRequest{
		Hostname: "localhost",
		Port:     8091,
		Credentials: models.Credentials{
			Username: "admin",
			Password: "password",
		},
	}
	clusterMap := map[string]interface{}{
		"hostname": request.Hostname,
		"port":     request.Port,
		"credentials": map[string]interface{}{
			"username": request.Credentials.Username,
			"password": request.Credentials.Password,
		},
	}
	id, err := fileStorage.SaveSnapshot(clusterMap, "vmagent")
	if err != nil {
		t.Fatalf("Failed to save snapshot: %v", err)
	}

	// Make GET request to retrieve the snapshot
	url := "/api/v1/snapshot/" + id
	req := httptest.NewRequest("GET", url, nil)
	w := httptest.NewRecorder()

	handler.GetSnapshotRequest(w, req)

	// Check response status
	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
		t.Logf("Response body: %s", w.Body.String())
	}

	// Parse response
	var response models.SnapshotRequest
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	// Verify response fields
	if response.Hostname != request.Hostname {
		t.Errorf("Expected hostname %s, got %s", request.Hostname, response.Hostname)
	}
	if response.Port != request.Port {
		t.Errorf("Expected port %d, got %d", request.Port, response.Port)
	}
	if response.Name == "" {
		t.Error("Expected non-empty Name in response")
	}
	if response.TimeStamp.IsZero() {
		t.Error("Expected non-zero TimeStamp in response")
	}

	// Test error case: missing snapshot ID
	reqMissing := httptest.NewRequest("GET", "/api/v1/snapshot/", nil)
	wMissing := httptest.NewRecorder()
	handler.GetSnapshotRequest(wMissing, reqMissing)
	if wMissing.Code != http.StatusNotFound {
		t.Errorf("Expected status %d for missing ID, got %d", http.StatusBadRequest, wMissing.Code)
	}

	// Test error case: non-existent snapshot ID
	reqNotFound := httptest.NewRequest("GET", "/api/v1/snapshot/nonexistentid", nil)
	wNotFound := httptest.NewRecorder()
	handler.GetSnapshotRequest(wNotFound, reqNotFound)
	if wNotFound.Code != http.StatusNotFound {
		t.Errorf("Expected status %d for not found, got %d", http.StatusNotFound, wNotFound.Code)
	}
}
