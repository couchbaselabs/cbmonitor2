package test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/couchbase/cbmonitor/internal/config-manager/api"
	"github.com/couchbase/cbmonitor/internal/config-manager/models"
	"github.com/couchbase/cbmonitor/internal/config-manager/storage"
)

func TestCreateSnapshot(t *testing.T) {
	// Create temporary directory for test files
	tempDir := t.TempDir()

	// Initialize storage
	fileStorage := storage.NewFileStorage(tempDir)

	// Initialize handler
	handler := api.NewHandler(fileStorage, "vmagent")

	// Create test request
	request := models.SnapshotRequest{
		ClusterInfo: models.ClusterInfo{
			Name:     "test-cluster",
			Hostname: "localhost",
			Port:     8091,
			Credentials: models.Credentials{
				Username: "admin",
				Password: "password",
			},
		},
	}

	// Convert request to JSON
	requestBody, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("Failed to marshal request: %v", err)
	}

	// Create HTTP request
	req := httptest.NewRequest("POST", "/api/v1/snapshot", bytes.NewBuffer(requestBody))
	req.Header.Set("Content-Type", "application/json")

	// Create response recorder
	w := httptest.NewRecorder()

	// Call handler
	handler.CreateSnapshot(w, req)

	// Check response status
	if w.Code != http.StatusCreated {
		t.Errorf("Expected status %d, got %d", http.StatusCreated, w.Code)
		t.Logf("Response body: %s", w.Body.String())
	}

	// Parse response
	var response models.SnapshotResponse
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	// Verify response fields
	if response.ID == "" {
		t.Error("Expected non-empty ID in response")
	}

	if response.AgentType != "vmagent" {
		t.Errorf("Expected agent type 'vmagent', got '%s'", response.AgentType)
	}

	if response.Status != "created" {
		t.Errorf("Expected status 'created', got '%s'", response.Status)
	}

	// Check if file was created
	expectedFile := filepath.Join(tempDir, fmt.Sprintf("%s.yml", response.ID))
	if _, err := os.Stat(expectedFile); os.IsNotExist(err) {
		t.Errorf("Expected file %s to be created", expectedFile)
	}

	// Verify file content
	content, err := os.ReadFile(expectedFile)
	if err != nil {
		t.Fatalf("Failed to read created file: %v", err)
	}

	if len(content) == 0 {
		t.Error("Created file is empty")
	}

	// Verify the content contains expected structure
	contentStr := string(content)
	if !bytes.Contains(content, []byte("job_name:")) {
		t.Error("Expected file to contain 'job_name:'")
	}
	if !bytes.Contains(content, []byte("basic_auth:")) {
		t.Error("Expected file to contain 'basic_auth:'")
	}
	if !bytes.Contains(content, []byte("http_sd_configs:")) {
		t.Error("Expected file to contain 'http_sd_configs:'")
	}
	if !bytes.Contains(content, []byte("http://localhost:8091/prometheus_sd_config?port=insecure")) {
		t.Error("Expected file to contain the correct URL")
	}

	t.Logf("Created file content: %s", contentStr)
}

func TestCreateSnapshotInvalidRequest(t *testing.T) {
	// Create temporary directory for test files
	tempDir := t.TempDir()

	// Initialize storage
	fileStorage := storage.NewFileStorage(tempDir)

	// Initialize handler
	handler := api.NewHandler(fileStorage, "vmagent")

	// Test cases
	testCases := []struct {
		name         string
		request      models.SnapshotRequest
		expectedCode int
	}{
		{
			name: "missing cluster name",
			request: models.SnapshotRequest{
				ClusterInfo: models.ClusterInfo{
					Name:     "",
					Hostname: "localhost",
					Port:     8091,
				},
			},
			expectedCode: http.StatusBadRequest,
		},
		{
			name: "missing hostname",
			request: models.SnapshotRequest{
				ClusterInfo: models.ClusterInfo{
					Name:     "test-cluster",
					Hostname: "",
					Port:     8091,
				},
			},
			expectedCode: http.StatusBadRequest,
		},
		{
			name: "missing credentials",
			request: models.SnapshotRequest{
				ClusterInfo: models.ClusterInfo{
					Name:     "test-cluster",
					Hostname: "localhost",
					Port:     8091,
					Credentials: models.Credentials{
						Username: "",
						Password: "",
					},
				},
			},
			expectedCode: http.StatusBadRequest,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Convert request to JSON
			requestBody, err := json.Marshal(tc.request)
			if err != nil {
				t.Fatalf("Failed to marshal request: %v", err)
			}

			// Create HTTP request
			req := httptest.NewRequest("POST", "/api/v1/snapshot", bytes.NewBuffer(requestBody))
			req.Header.Set("Content-Type", "application/json")

			// Create response recorder
			w := httptest.NewRecorder()

			// Call handler
			handler.CreateSnapshot(w, req)

			// Check response status
			if w.Code != tc.expectedCode {
				t.Errorf("Expected status %d, got %d", tc.expectedCode, w.Code)
				t.Logf("Response body: %s", w.Body.String())
			}
		})
	}
}
