package storage

import (
	"github.com/couchbase/config-manager/internal/config"
	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/models"
)

// MetadataStorage defines the interface for storing and retrieving metadata
type MetadataStorage interface {
	SaveMetadata(metadata *models.ClusterMetadata) error
	GetMetadata(snapshotID string) (*models.ClusterMetadata, error)
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