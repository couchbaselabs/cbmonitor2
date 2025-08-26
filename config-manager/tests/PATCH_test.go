package tests

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/couchbase/config-manager/internal/api"
	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/storage"
)

func TestPatchSnapshot(t *testing.T) {
	tempDir := t.TempDir()

	fileStorage := storage.NewFileStorage(tempDir)
	handler := api.NewHandler(fileStorage, "vmagent")

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

	//gets the original timestamp to make sure that they are updated
	originalSnapshot, err := fileStorage.GetSnapshot(id)
	if err != nil {
		t.Fatalf("Failed to get original snapshot: %v", err)
	}
	originalTime := originalSnapshot.TimeStamp

	// send a mock patch request
	url := "/api/v1/snapshot/" + id
	req := httptest.NewRequest(http.MethodPatch, url, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}
	w := httptest.NewRecorder()
	handler.PatchSnapshotRequest(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status OK, got %v", w.Code)
	}

	updatedSnapshot, err := fileStorage.GetSnapshot(id)
	if err != nil {
		t.Fatalf("Failed to get updated snapshot: %v", err)
	}

	if updatedSnapshot.Hostname != request.Hostname {
		t.Errorf("Expected hostname %s, got %s", request.Hostname, updatedSnapshot.Hostname)
	}
	if updatedSnapshot.Port != request.Port {
		t.Errorf("Expected port %d, got %d", request.Port, updatedSnapshot.Port)
	}
	if updatedSnapshot.Name == "" {
		t.Error("Expected non-empty Name in response")
	}
	if updatedSnapshot.TimeStamp.IsZero() {
		t.Error("Expected non-zero TimeStamp in response")
	}
	if updatedSnapshot.TimeStamp.Before(originalTime) {
		t.Errorf("Expected TimeStamp %v, got %v", originalTime, updatedSnapshot.TimeStamp)
	}
}
