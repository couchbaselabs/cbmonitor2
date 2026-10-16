package storage

import (
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/couchbase/config-manager/internal/models"
)

func TestReconnectingStorageFailsUntilConnectedThenDelegates(t *testing.T) {
	var up atomic.Bool
	cs, _ := newTestCouchbaseStorage(t)
	rs := newReconnectingStorage(func() (*CouchbaseStorage, error) {
		if !up.Load() {
			return nil, errors.New("bucket not ready")
		}
		return cs, nil
	}, 5*time.Millisecond)
	defer rs.Close()

	// Writes fail rather than report success, so they queue.
	if err := rs.EoLSnapshot("snap", time.Now()); !errors.Is(err, ErrMetadataUnavailable) {
		t.Fatalf("before connecting: err = %v, want ErrMetadataUnavailable", err)
	}
	if err := rs.Ping(); err == nil {
		t.Error("Ping succeeded before connecting")
	}

	up.Store(true)
	deadline := time.Now().Add(2 * time.Second)
	for rs.Ping() != nil {
		if time.Now().After(deadline) {
			t.Fatal("never connected")
		}
		time.Sleep(5 * time.Millisecond)
	}

	if err := rs.SaveMetadata(&models.SnapshotMetadata{SnapshotID: "snap", TsEnd: "now"}); err != nil {
		t.Fatal(err)
	}
	if err := rs.EoLSnapshot("snap", time.Now()); err != nil {
		t.Fatalf("after connecting: %v", err)
	}
	if md, _ := rs.GetMetadata("snap"); md == nil || md.TsEnd == "now" {
		t.Errorf("document %+v, want the end of life recorded through the connected store", md)
	}
}

func TestReconnectingStorageStopsRetryingOnClose(t *testing.T) {
	var attempts atomic.Int32
	rs := newReconnectingStorage(func() (*CouchbaseStorage, error) {
		attempts.Add(1)
		return nil, errors.New("down")
	}, 5*time.Millisecond)
	time.Sleep(30 * time.Millisecond)
	_ = rs.Close()
	after := attempts.Load()
	time.Sleep(30 * time.Millisecond)
	if attempts.Load() > after+1 {
		t.Errorf("kept retrying after Close: %d then %d attempts", after, attempts.Load())
	}
}
