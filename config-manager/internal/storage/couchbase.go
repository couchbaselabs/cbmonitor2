package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/couchbase/config-manager/internal/config"
	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/gocb/v2"
)

// CouchbaseStorage handles storing metadata in Couchbase
type CouchbaseStorage struct {
	cluster *gocb.Cluster
	bucket  *gocb.Bucket
	config  *config.Config
}

// NewCouchbaseStorage creates a new Couchbase storage instance
func NewCouchbaseStorage(cfg *config.Config) (*CouchbaseStorage, error) {
	if !cfg.Metadata.Enabled {
		return nil, fmt.Errorf("metadata storage is disabled")
	}

	// Build connection string
	connectionString := fmt.Sprintf("couchbase://%s", cfg.Metadata.Host)

	// Connect to Couchbase cluster
	cluster, err := gocb.Connect(connectionString, gocb.ClusterOptions{
		Authenticator: gocb.PasswordAuthenticator{
			Username: cfg.Metadata.Username,
			Password: cfg.Metadata.Password,
		},
		TimeoutsConfig: gocb.TimeoutsConfig{
			ConnectTimeout: cfg.Metadata.Timeout,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Couchbase cluster: %w", err)
	}

	// Get bucket reference
	bucket := cluster.Bucket(cfg.Metadata.Bucket)

	// Wait for bucket to be ready
	ctx, cancel := context.WithTimeout(context.Background(), cfg.Metadata.Timeout)
	defer cancel()
	
	err = bucket.WaitUntilReady(cfg.Metadata.Timeout, &gocb.WaitUntilReadyOptions{
		Context: ctx,
	})
	if err != nil {
		cluster.Close(nil)
		return nil, fmt.Errorf("bucket not ready: %w", err)
	}

	logger.Info("Connected to Couchbase for metadata storage", 
		"host", cfg.Metadata.Host, 
		"bucket", cfg.Metadata.Bucket)

	return &CouchbaseStorage{
		cluster: cluster,
		bucket:  bucket,
		config:  cfg,
	}, nil
}

// SaveMetadata saves cluster metadata to Couchbase
func (cs *CouchbaseStorage) SaveMetadata(metadata *models.SnapshotMetadata) error {
	// Upsert the document
	_, err := cs.bucket.DefaultCollection().Upsert(metadata.SnapshotID, metadata, nil)
	if err != nil {
		return fmt.Errorf("failed to save metadata to Couchbase: %w", err)
	}

	logger.Info("Successfully saved metadata to Couchbase", "id", metadata.SnapshotID)

	return nil
}

// GetMetadata retrieves cluster metadata from Couchbase
func (cs *CouchbaseStorage) GetMetadata(snapshotID string) (*models.SnapshotMetadata, error) {
	// Get the document
	result, err := cs.bucket.DefaultCollection().Get(snapshotID, nil)
	if err != nil {
		if errors.Is(err, gocb.ErrDocumentNotFound) {
			return nil, fmt.Errorf("metadata not found for snapshot %s", snapshotID)
		}
		return nil, fmt.Errorf("failed to get metadata from Couchbase: %w", err)
	}

	// Decode the document
	var metadata models.SnapshotMetadata
	err = result.Content(&metadata)
	if err != nil {
		return nil, fmt.Errorf("failed to decode metadata: %w", err)
	}

	return &metadata, nil
}

// Close closes the Couchbase connection
func (cs *CouchbaseStorage) Close() error {
	if cs.cluster != nil {
		return cs.cluster.Close(nil)
	}
	return nil
}

// Type returns the type of the metadata storage
func (cs *CouchbaseStorage) Type() string {
	return "couchbase"
}

func (cs *CouchbaseStorage) UpdatePhase(snapshotID string, phase string, mode string) error {
	// Implement Couchbase update phase logic here
	snapshotMetadata, err := cs.GetMetadata(snapshotID)
	if err != nil {
		return fmt.Errorf("failed to get metadata for update: %w", err)
	}
	if mode != "start" && mode != "end" {
		return fmt.Errorf("invalid mode: %s", mode)
	} else if mode == "start" {
		snapshotMetadata.Phases = append(snapshotMetadata.Phases, models.Phase{
			Label:   phase,
			TsStart: time.Now(),
		})
	} else if mode == "end" {
		if len(snapshotMetadata.Phases) > 0 {
			snapshotMetadata.Phases[len(snapshotMetadata.Phases)-1].TsEnd = time.Now()
		}
	}
	err = cs.SaveMetadata(snapshotMetadata)
	if err != nil {
		return fmt.Errorf("failed to save updated metadata: %w", err)
	}

	return nil
}	

func (cs *CouchbaseStorage) EoLSnapshot(snapshotID string) error {
	eol, err := cs.GetMetadata(snapshotID)
	if err != nil {
		return fmt.Errorf("failed to get metadata for deletion: %w", err)
	}

	eol.TsEnd = time.Now()

	err = cs.SaveMetadata(eol)
	if err != nil {
		return fmt.Errorf("failed to save end time for metadata: %w", err)
	}

	return nil
}