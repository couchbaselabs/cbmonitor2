package storage

import (
	"github.com/couchbase/config-manager/internal/models"
)

// MetadataStorage stores snapshot metadata documents. CouchbaseStorage is the
// store; ReconnectingStorage stands in for it until Couchbase Server is
// reachable.
type MetadataStorage interface {
	// Create writes metadata as its snapshot's document unless one exists. An
	// existing document is left as it is and is not an error, so a create that
	// is applied again never undoes the writes made after it.
	Create(metadata *models.SnapshotMetadata) error
	GetMetadata(snapshotID string) (*models.SnapshotMetadata, error)
	// Update applies fn to the current document and writes it back without
	// overwriting a concurrent change; see CouchbaseStorage.Update.
	Update(snapshotID string, fn func(*models.SnapshotMetadata) error) error
	// Ping reports whether the store can be reached.
	Ping() error
	Close() error
}
