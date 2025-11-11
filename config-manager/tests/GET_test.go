package tests

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/couchbase/config-manager/internal/api"
	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/storage"
)

func TestGetSnapshotRequest(t *testing.T) {
	tempDir := t.TempDir()
	t.Logf("Using temporary directory: %s", tempDir)

	// Initialize storage and handler
	fileStorage := storage.NewFileStorage(tempDir)
	handler := api.NewHandler(fileStorage, storage.NewFileMetadataStorage(tempDir), "vmagent")

	// Create a snapshot to retrieve
	request := models.SnapshotRequest{
		Configs: []models.ConfigObject{
			{
				Hostnames: []string{"localhost"},
				Type:      "couchbase",
				Port:      8091,
			},
		},
		Credentials: models.Credentials{
			Username: "admin",
			Password: "password",
		},
		Scheme: "http",
	}
	
	clusterMap := map[string]interface{}{
		"configs":   []interface{}{
			map[string]interface{}{
				"hostnames": request.Configs[0].Hostnames,
				"type":      request.Configs[0].Type,
				"port":      request.Configs[0].Port,
			},
		},
		"credentials": map[string]interface{}{
			"username": request.Credentials.Username,
			"password": request.Credentials.Password,
		},
		"scheme": request.Scheme,
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
	
	// checking that the file actually exists
    filepath := tempDir + "/" + id + ".yml"
    if _, err := os.Stat(filepath); err != nil {
        t.Errorf("Expected file %s to exist, but got error: %v", filepath, err)
    }

	// Check response status
	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
		t.Logf("Response body: %s", w.Body.String())
	}

	// Parse response
	var response models.DisplaySnapshot
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	// Verify response fields
	// if response.Name != request.Configs[0].Hostnames[0] {
	// 	t.Errorf("Expected hostname %s, got %s", request.Configs[0].Hostnames[0], response.Name)
	// }
	// if response.Port != request.Port {
	// 	t.Errorf("Expected port %d, got %d", request.Port, response.Port)
	// }
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
