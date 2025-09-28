package tests

import (
	"testing"
	"time"

	"github.com/couchbase/config-manager/internal/config"
	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/storage"
)

func TestCouchbaseMetadataStorage(t *testing.T) {
	// Skip this test if Couchbase is not available
	// This test requires a running Couchbase instance
	t.Skip("Skipping Couchbase test - requires running Couchbase instance")

	// Create test configuration
	cfg := &config.Config{}
	cfg.Metadata.Enabled = true
	cfg.Metadata.Host = "localhost"
	cfg.Metadata.Bucket = "metadata"
	cfg.Metadata.Timeout = 30 * time.Second

	// Initialize Couchbase storage
	couchbaseStorage, err := storage.NewCouchbaseStorage(cfg)
	if err != nil {
		t.Fatalf("Failed to create Couchbase storage: %v", err)
	}
	defer couchbaseStorage.Close()

	// Create test metadata
	metadata := &models.ClusterMetadata{
		SnapshotID: "test-snapshot-123",
		Buckets:    []string{"bucket1", "bucket2", "bucket3"},
		Nodes:      []string{"node1.example.com", "node2.example.com"},
		Indexes:    []string{"idx1", "idx2", "idx3", "idx4"},
		Timestamp:  time.Now(),
	}

	// Test saving metadata
	err = couchbaseStorage.SaveMetadata(metadata)
	if err != nil {
		t.Fatalf("Failed to save metadata: %v", err)
	}

	// Test retrieving metadata
	retrievedMetadata, err := couchbaseStorage.GetMetadata("test-snapshot-123")
	if err != nil {
		t.Fatalf("Failed to get metadata: %v", err)
	}

	// Verify retrieved metadata matches original
	if retrievedMetadata.SnapshotID != metadata.SnapshotID {
		t.Errorf("Expected SnapshotID %s, got %s", metadata.SnapshotID, retrievedMetadata.SnapshotID)
	}

	if len(retrievedMetadata.Buckets) != len(metadata.Buckets) {
		t.Errorf("Expected %d buckets, got %d", len(metadata.Buckets), len(retrievedMetadata.Buckets))
	}
}

func TestFileMetadataStorageFallback(t *testing.T) {
	// Test file storage fallback when metadata is disabled
	cfg := &config.Config{}
	cfg.Metadata.Enabled = false
	cfg.Agent.Directory = "./test_data"

	// Initialize metadata storage (should use file fallback)
	metadataStorage, err := storage.NewMetadataStorage(cfg)
	if err != nil {
		t.Fatalf("Failed to create metadata storage: %v", err)
	}
	defer metadataStorage.Close()

	// Test saving metadata (should be no-op)
	metadata := &models.ClusterMetadata{
		SnapshotID: "test-snapshot-123",
		Buckets:    []string{"bucket1", "bucket2"},
		Nodes:      []string{"node1.example.com"},
		Indexes:    []string{"idx1", "idx2"},
		Timestamp:  time.Now(),
	}

	err = metadataStorage.SaveMetadata(metadata)
	if err != nil {
		t.Fatalf("Failed to save metadata: %v", err)
	}

	// Test getting metadata (should return nil)
	retrievedMetadata, err := metadataStorage.GetMetadata("test-snapshot-123")
	if err != nil {
		t.Fatalf("Failed to get metadata: %v", err)
	}

	if retrievedMetadata != nil {
		t.Error("Expected nil metadata from file fallback, got non-nil")
	}
}
