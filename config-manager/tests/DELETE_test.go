package tests

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/couchbase/config-manager/internal/api"
	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/storage"
)

func TestDeleteSnapshotRequest(t *testing.T) {
	tempDir := t.TempDir()

	// Initialize storage and handler
	fileStorage := storage.NewFileStorage(tempDir)
	handler := api.NewHandler(fileStorage, storage.NewFileMetadataStorage(tempDir), "vmagent")

	// Create a snapshot to delete
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

	// Make DELETE request to remove the snapshot
	url := "/api/v1/snapshot/" + id
	req := httptest.NewRequest("DELETE", url, nil)
	w := httptest.NewRecorder()

	handler.DeleteSnapshotRequest(w, req)

	// Check response status
	if w.Code != http.StatusNoContent {
		t.Errorf("Expected status %d, got %d", http.StatusNoContent, w.Code)
		t.Logf("Response body: %s", w.Body.String())
	}

	// checking that the file is gone
	filepath := tempDir + "/" + id + ".yml"
	if _, err := os.Stat(filepath); err == nil {
		t.Errorf("Expected file %s to be deleted", filepath)
	} else if !os.IsNotExist(err) {
		t.Fatalf("Failed to stat file %s: %v", filepath, err)
	}
}