package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"github.com/couchbase/config-manager/internal/config"
	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/models"
)

// MetadataStorage defines the interface for storing and retrieving metadata
type MetadataStorage interface {
	SaveMetadata(metadata *models.ClusterMetadata) error
	GetMetadata(snapshotID string) (*models.ClusterMetadata, error)
	UpdatePhase(snapshotID string, phase string, mode string) error
	Close() error
	Type() string
}

// NewMetadataStorage creates the appropriate metadata storage based on configuration
func NewMetadataStorage(cfg *config.Config) (MetadataStorage, error) {
	if cfg.Metadata.Enabled {
		return NewCouchbaseStorage(cfg)
	}

	// Fallback to file storage if metadata is disabled
	logger.Info("Metadata storage is disabled. Storing metadata in file.", "directory", cfg.Agent.Directory)
	return NewFileMetadataStorage(cfg.Agent.Directory), nil
}

// FileMetadataStorage implements MetadataStorage using files (fallback)
type FileMetadataStorage struct {
	baseDirectory string
}

// NewFileMetadataStorage creates a file-based metadata storage
func NewFileMetadataStorage(baseDirectory string) *FileMetadataStorage {
	return &FileMetadataStorage{
		baseDirectory: baseDirectory,
	}
}

// SaveMetadata saves metadata to a file (fallback implementation)
func (fs *FileMetadataStorage) SaveMetadata(metadata *models.ClusterMetadata) error {
	// This is a no-op fallback - metadata collection is disabled
	return nil
}

// GetMetadata retrieves metadata from a file (fallback implementation)
func (fs *FileMetadataStorage) GetMetadata(snapshotID string) (*models.ClusterMetadata, error) {
	// This is a no-op fallback - metadata collection is disabled
	return nil, nil
}

// Close closes the file storage (no-op for file storage)
func (fs *FileMetadataStorage) Close() error {
	return nil
}

// Type returns the type of the metadata storage
func (fs *FileMetadataStorage) Type() string {
	return "file"
}

func (fs *FileMetadataStorage) UpdatePhase(snapshotID string, phase string, mode string) error {
	metadataPath := filepath.Join(fs.baseDirectory, snapshotID+"_metadata.json")
	type Phase struct {
		Label   string `json:"label"`
		TsStart string `json:"ts_start,omitempty"`
		TsEnd   string `json:"ts_end,omitempty"`
	}
	type Metadata struct {
		Phases []Phase `json:"phases"`
	}

	var metadata Metadata
	if data, err := os.ReadFile(metadataPath); err == nil {
		if err := json.Unmarshal(data, &metadata); err != nil {
			return err
		}
	}

	now := time.Now().Format(time.RFC3339Nano)
	found := false
	for i, p := range metadata.Phases {
		if p.Label == phase {
			found = true
			if mode == "start" {
				metadata.Phases[i].TsStart = now
			} else if mode == "end" {
				metadata.Phases[i].TsEnd = now
			}
			break
		}
	}
	if !found {
		entry := Phase{Label: phase}
		if mode == "start" {
			entry.TsStart = now
		} else if mode == "end" {
			entry.TsEnd = now
		}
		metadata.Phases = append(metadata.Phases, entry)
	}
	out, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(metadataPath, out, 0644)
}
