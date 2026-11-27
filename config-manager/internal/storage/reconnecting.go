package storage

import (
	"errors"
	"sync"
	"time"

	"github.com/couchbase/config-manager/internal/config"
	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/models"
)

// ErrMetadataUnavailable reports that the metadata store has not connected yet.
var ErrMetadataUnavailable = errors.New("metadata store is not connected yet")

// ReconnectingStorage stands in for the metadata storage when Couchbase
// Server could not be reached at startup. It keeps trying in the background
// and, until it connects, fails every operation with ErrMetadataUnavailable,
// so writes queue and are applied once it is up.
type ReconnectingStorage struct {
	connect func() (*CouchbaseStorage, error)
	retry   time.Duration

	mu    sync.RWMutex
	inner *CouchbaseStorage

	stopOnce sync.Once
	done     chan struct{}
}

// NewReconnectingStorage starts connecting to Couchbase Server in the
// background, retrying every retry until it succeeds or Close is called.
func NewReconnectingStorage(cfg *config.Config, retry time.Duration) *ReconnectingStorage {
	return newReconnectingStorage(func() (*CouchbaseStorage, error) { return NewCouchbaseStorage(cfg) }, retry)
}

func newReconnectingStorage(connect func() (*CouchbaseStorage, error), retry time.Duration) *ReconnectingStorage {
	s := &ReconnectingStorage{connect: connect, retry: retry, done: make(chan struct{})}
	go s.loop()
	return s
}

func (s *ReconnectingStorage) loop() {
	for {
		select {
		case <-s.done:
			return
		case <-time.After(s.retry):
		}
		cs, err := s.connect()
		if err != nil {
			logger.Warn("Metadata store still unreachable; metadata writes are queued", "error", err)
			continue
		}
		s.mu.Lock()
		s.inner = cs
		s.mu.Unlock()
		logger.Info("Metadata store connected; queued metadata writes will now apply")
		return
	}
}

func (s *ReconnectingStorage) current() (*CouchbaseStorage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.inner == nil {
		return nil, ErrMetadataUnavailable
	}
	return s.inner, nil
}

func (s *ReconnectingStorage) SaveMetadata(md *models.SnapshotMetadata) error {
	cs, err := s.current()
	if err != nil {
		return err
	}
	return cs.SaveMetadata(md)
}

func (s *ReconnectingStorage) GetMetadata(id string) (*models.SnapshotMetadata, error) {
	cs, err := s.current()
	if err != nil {
		return nil, err
	}
	return cs.GetMetadata(id)
}

func (s *ReconnectingStorage) Update(id string, fn func(*models.SnapshotMetadata) error) error {
	cs, err := s.current()
	if err != nil {
		return err
	}
	return cs.Update(id, fn)
}

func (s *ReconnectingStorage) Ping() error {
	cs, err := s.current()
	if err != nil {
		return err
	}
	return cs.Ping()
}

// Close stops reconnecting and closes the connection if one was made.
func (s *ReconnectingStorage) Close() error {
	s.stopOnce.Do(func() { close(s.done) })
	if cs, err := s.current(); err == nil {
		return cs.Close()
	}
	return nil
}
