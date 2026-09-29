package storage

import (
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/gocb/v2"
)

// fakeStore models a Couchbase Server collection's CAS semantics: every
// write bumps the document's CAS, and replace fails with errCASMismatch on a
// stale one. beforeReplace, when set, runs between an update's read and its
// write, standing in for a competing writer.
type fakeStore struct {
	mu            sync.Mutex
	docs          map[string]models.SnapshotMetadata
	cas           map[string]gocb.Cas
	beforeReplace func()
	replaces      int
}

func newFakeStore() *fakeStore {
	return &fakeStore{docs: map[string]models.SnapshotMetadata{}, cas: map[string]gocb.Cas{}}
}

func (f *fakeStore) get(id string) (*models.SnapshotMetadata, gocb.Cas, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	md, ok := f.docs[id]
	if !ok {
		return nil, 0, fmt.Errorf("%w for snapshot %s", errMetadataNotFound, id)
	}
	md.Phases = append([]models.Phase(nil), md.Phases...)
	md.Services = append([]string(nil), md.Services...)
	return &md, f.cas[id], nil
}

func (f *fakeStore) replace(id string, md *models.SnapshotMetadata, cas gocb.Cas) error {
	if hook := f.beforeReplace; hook != nil {
		hook()
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.replaces++
	if f.cas[id] != cas {
		return errCASMismatch
	}
	f.docs[id] = *md
	f.cas[id]++
	return nil
}

func (f *fakeStore) upsert(id string, md *models.SnapshotMetadata) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.docs[id] = *md
	f.cas[id]++
	return nil
}

func newTestCouchbaseStorage(t *testing.T) (*CouchbaseStorage, *fakeStore) {
	t.Helper()
	prev := casBackoff
	casBackoff = func(int) time.Duration { return time.Millisecond }
	t.Cleanup(func() { casBackoff = prev })
	store := newFakeStore()
	return &CouchbaseStorage{store: store}, store
}

func seed(t *testing.T, cs *CouchbaseStorage, id string) {
	t.Helper()
	if err := cs.SaveMetadata(&models.SnapshotMetadata{SnapshotID: id, TsStart: time.Now(), TsEnd: "now"}); err != nil {
		t.Fatal(err)
	}
}

func TestUpdateKeepsAConcurrentWritersChange(t *testing.T) {
	cs, store := newTestCouchbaseStorage(t)
	seed(t, cs, "snap")

	// A phase PATCH lands between this update's read and its write. The hook
	// runs again inside that PATCH's own write, so it fires only once.
	fired := false
	store.beforeReplace = func() {
		if fired {
			return
		}
		fired = true
		if err := cs.UpdatePhase("snap", "load", "start"); err != nil {
			t.Errorf("competing UpdatePhase: %v", err)
		}
	}
	if err := cs.UpdateServices("snap", []string{"kv"}); err != nil {
		t.Fatalf("UpdateServices: %v", err)
	}

	md, _ := cs.GetMetadata("snap")
	if len(md.Phases) != 1 || len(md.Services) != 1 {
		t.Errorf("phases %v services %v: one writer's change was lost", md.Phases, md.Services)
	}
}

func TestConcurrentPhaseUpdatesAreNotLost(t *testing.T) {
	cs, _ := newTestCouchbaseStorage(t)
	seed(t, cs, "snap")

	const writers = 6
	var wg sync.WaitGroup
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if err := cs.UpdatePhase("snap", fmt.Sprintf("phase-%d", i), "start"); err != nil {
				t.Errorf("UpdatePhase %d: %v", i, err)
			}
		}(i)
	}
	wg.Wait()

	md, _ := cs.GetMetadata("snap")
	if len(md.Phases) != writers {
		t.Errorf("%d phases recorded, want %d", len(md.Phases), writers)
	}
}

func TestUpdateGivesUpOnAPersistentConflict(t *testing.T) {
	cs, store := newTestCouchbaseStorage(t)
	seed(t, cs, "snap")
	store.beforeReplace = func() {
		// Another writer wins every race.
		_ = store.upsert("snap", &models.SnapshotMetadata{SnapshotID: "snap"})
	}

	err := cs.EoLSnapshot("snap")
	if !errors.Is(err, errCASMismatch) {
		t.Fatalf("err = %v, want a CAS mismatch after retrying", err)
	}
	if store.replaces != maxCASAttempts {
		t.Errorf("%d write attempts, want %d", store.replaces, maxCASAttempts)
	}
}

func TestUpdateOnAMissingDocumentDoesNotCallFn(t *testing.T) {
	cs, _ := newTestCouchbaseStorage(t)
	called := false
	err := cs.Update("missing", func(*models.SnapshotMetadata) error { called = true; return nil })
	if !errors.Is(err, errMetadataNotFound) || called {
		t.Errorf("err = %v, fn called = %v; want not-found without calling fn", err, called)
	}
}

func TestUpdatePhaseRejectsAnUnknownModeWithoutReading(t *testing.T) {
	cs, store := newTestCouchbaseStorage(t)
	seed(t, cs, "snap")
	if err := cs.UpdatePhase("snap", "load", "pause"); err == nil {
		t.Fatal("expected an error for mode \"pause\"")
	}
	if store.replaces != 0 {
		t.Error("an invalid mode must not write the document")
	}
}
