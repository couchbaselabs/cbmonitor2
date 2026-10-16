package storage

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"strings"
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
	store   docStore
}

// ErrMetadataNotFound reports that a snapshot has no metadata document.
var ErrMetadataNotFound = errors.New("metadata not found")

// errCASMismatch reports that a document changed between read and write.
var errCASMismatch = errors.New("metadata document changed concurrently")

// docStore is the key-value surface CouchbaseStorage needs from a collection.
// replace succeeds only if the document still carries cas, returning
// errCASMismatch otherwise, which is what makes read-modify-write safe.
type docStore interface {
	get(id string) (*models.SnapshotMetadata, gocb.Cas, error)
	replace(id string, md *models.SnapshotMetadata, cas gocb.Cas) error
	upsert(id string, md *models.SnapshotMetadata) error
}

type collectionStore struct{ c *gocb.Collection }

func (s collectionStore) get(id string) (*models.SnapshotMetadata, gocb.Cas, error) {
	res, err := s.c.Get(id, nil)
	if err != nil {
		if errors.Is(err, gocb.ErrDocumentNotFound) {
			return nil, 0, fmt.Errorf("%w for snapshot %s", ErrMetadataNotFound, id)
		}
		return nil, 0, fmt.Errorf("failed to get metadata from Couchbase Server: %w", err)
	}
	var md models.SnapshotMetadata
	if err := res.Content(&md); err != nil {
		return nil, 0, fmt.Errorf("failed to decode metadata: %w", err)
	}
	return &md, res.Cas(), nil
}

func (s collectionStore) replace(id string, md *models.SnapshotMetadata, cas gocb.Cas) error {
	_, err := s.c.Replace(id, md, &gocb.ReplaceOptions{Cas: cas})
	if errors.Is(err, gocb.ErrCasMismatch) {
		return errCASMismatch
	}
	return err
}

func (s collectionStore) upsert(id string, md *models.SnapshotMetadata) error {
	_, err := s.c.Upsert(id, md, nil)
	return err
}

// maxCASAttempts bounds how often update re-reads a document that keeps
// changing underneath it. Writers per snapshot are few (a phase PATCH, the
// end-of-life sweep, background metadata collection), so this is generous.
const maxCASAttempts = 8

// casBackoff spaces out retries so competing writers stop colliding.
var casBackoff = func(attempt int) time.Duration {
	return time.Duration(attempt)*10*time.Millisecond + time.Duration(rand.Int63n(int64(10*time.Millisecond)))
}

// NewCouchbaseStorage creates a new Couchbase storage instance
func NewCouchbaseStorage(cfg *config.Config) (*CouchbaseStorage, error) {
	if !cfg.Metadata.Enabled {
		return nil, fmt.Errorf("metadata storage is disabled")
	}

	// Build connection string. If the configured host already includes a
	// URI scheme, use it as-is; otherwise default to plaintext couchbase://
	connectionString := cfg.Metadata.Host
	if !strings.Contains(connectionString, "://") {
		connectionString = fmt.Sprintf("couchbase://%s", connectionString)
	}

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
		store:   collectionStore{c: bucket.DefaultCollection()},
	}, nil
}

// SaveMetadata writes a snapshot's metadata document, replacing any existing one.
func (cs *CouchbaseStorage) SaveMetadata(metadata *models.SnapshotMetadata) error {
	if err := cs.store.upsert(metadata.SnapshotID, metadata); err != nil {
		return fmt.Errorf("failed to save metadata to Couchbase Server: %w", err)
	}

	logger.Info("Successfully saved metadata to Couchbase", "id", metadata.SnapshotID)

	return nil
}

// GetMetadata retrieves cluster metadata from Couchbase
func (cs *CouchbaseStorage) GetMetadata(snapshotID string) (*models.SnapshotMetadata, error) {
	md, _, err := cs.store.get(snapshotID)
	return md, err
}

// Update applies fn to the current metadata document and writes it back only
// if nothing else changed it in between; on a conflict it re-reads and applies
// fn again. fn therefore runs once per attempt, always on a fresh copy.
// Concurrent writers (a phase PATCH, the sweep's end-of-life, background
// metadata collection) each keep their change instead of overwriting another's.
func (cs *CouchbaseStorage) Update(snapshotID string, fn func(*models.SnapshotMetadata) error) error {
	for attempt := 1; ; attempt++ {
		md, cas, err := cs.store.get(snapshotID)
		if err != nil {
			return err
		}
		if err := fn(md); err != nil {
			return err
		}
		err = cs.store.replace(snapshotID, md, cas)
		if !errors.Is(err, errCASMismatch) {
			if err != nil {
				return fmt.Errorf("failed to save metadata to Couchbase Server: %w", err)
			}
			return nil
		}
		if attempt == maxCASAttempts {
			return fmt.Errorf("metadata for snapshot %s changed on each of %d attempts: %w", snapshotID, attempt, err)
		}
		time.Sleep(casBackoff(attempt))
	}
}

// healthKey is never written, so reading it answers not-found when the store
// is reachable.
const healthKey = "__config_manager_health__"

// Ping reads a key that never exists: not-found means the store answered.
func (cs *CouchbaseStorage) Ping() error {
	_, _, err := cs.store.get(healthKey)
	if err == nil || errors.Is(err, ErrMetadataNotFound) {
		return nil
	}
	return err
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

func (cs *CouchbaseStorage) UpdatePhase(snapshotID string, phase string, mode string, at time.Time) error {
	if mode != "start" && mode != "end" {
		return fmt.Errorf("invalid mode: %s", mode)
	}
	err := cs.Update(snapshotID, func(md *models.SnapshotMetadata) error {
		md.ApplyPhase(phase, mode, at)
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to update phase: %w", err)
	}
	return nil
}

func (cs *CouchbaseStorage) UpdateServices(snapshotID string, services []string) error {
	err := cs.Update(snapshotID, func(md *models.SnapshotMetadata) error {
		md.Services = mergeServices(md.Services, services)
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to update services: %w", err)
	}
	return nil
}

func (cs *CouchbaseStorage) EoLSnapshot(snapshotID string, at time.Time) error {
	err := cs.Update(snapshotID, func(md *models.SnapshotMetadata) error {
		md.TsEnd = at.Format(time.RFC3339Nano)
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to record end of life: %w", err)
	}
	return nil
}

// mergeServices appends the services not already present, keeping order.
func mergeServices(existing, add []string) []string {
	seen := make(map[string]bool, len(existing)+len(add))
	for _, s := range existing {
		seen[s] = true
	}
	for _, s := range add {
		if !seen[s] {
			existing = append(existing, s)
			seen[s] = true
		}
	}
	return existing
}
