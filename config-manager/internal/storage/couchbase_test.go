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
		return nil, 0, fmt.Errorf("%w for snapshot %s", ErrMetadataNotFound, id)
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
		if err := cs.UpdatePhase("snap", "load", "start", time.Now()); err != nil {
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
			if err := cs.UpdatePhase("snap", fmt.Sprintf("phase-%d", i), "start", time.Now()); err != nil {
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

// A queued phase write can be applied twice: the store may have taken it
// before reporting a timeout, or the process may stop before the queue
// records it as done. The second application changes nothing.
func TestReplayedPhaseWritesChangeNothing(t *testing.T) {
	cs, _ := newTestCouchbaseStorage(t)
	seed(t, cs, "snap")
	t0 := time.Date(2026, 10, 16, 9, 0, 0, 123456789, time.UTC)
	t1 := t0.Add(time.Hour)
	t2 := t1.Add(time.Minute)
	t3 := t2.Add(time.Hour)
	t4 := t3.Add(time.Minute)
	writes := []struct {
		phase, mode string
		at          time.Time
	}{
		{"load", "start", t0},
		{"load", "end", t1},
		{"access", "start", t2},
		// No phase is labelled "other", so this closes access.
		{"other", "end", t3},
		{"rebalance", "start", t4},
	}
	for range 2 {
		for _, w := range writes {
			if err := cs.UpdatePhase("snap", w.phase, w.mode, w.at); err != nil {
				t.Fatal(err)
			}
		}
	}

	md, _ := cs.GetMetadata("snap")
	if len(md.Phases) != 3 {
		t.Fatalf("phases = %+v, want load, access and rebalance once each", md.Phases)
	}
	want := []struct {
		label string
		end   string
	}{
		{"load", t1.Format(time.RFC3339Nano)},
		{"access", t3.Format(time.RFC3339Nano)},
		// A replayed end closes the phase it closed the first time, never a
		// later one.
		{"rebalance", ""},
	}
	for i, w := range want {
		if md.Phases[i].Label != w.label || md.Phases[i].TsEnd != w.end {
			t.Errorf("phase %d = %+v, want %s ended at %q", i, md.Phases[i], w.label, w.end)
		}
	}
}

func TestPhaseEndWithAnUnknownLabelClosesTheLatestPhase(t *testing.T) {
	md := &models.SnapshotMetadata{}
	t0 := time.Now()
	md.ApplyPhase("load", "start", t0)
	md.ApplyPhase("other", "end", t0.Add(time.Minute))
	if md.Phases[0].TsEnd == "" {
		t.Errorf("phases = %+v, want the latest phase closed", md.Phases)
	}
}

func TestUpdateGivesUpOnAPersistentConflict(t *testing.T) {
	cs, store := newTestCouchbaseStorage(t)
	seed(t, cs, "snap")
	store.beforeReplace = func() {
		// Another writer wins every race.
		_ = store.upsert("snap", &models.SnapshotMetadata{SnapshotID: "snap"})
	}

	err := cs.EoLSnapshot("snap", time.Now())
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
	if !errors.Is(err, ErrMetadataNotFound) || called {
		t.Errorf("err = %v, fn called = %v; want not-found without calling fn", err, called)
	}
}

func TestUpdatePhaseRejectsAnUnknownModeWithoutReading(t *testing.T) {
	cs, store := newTestCouchbaseStorage(t)
	seed(t, cs, "snap")
	if err := cs.UpdatePhase("snap", "load", "pause", time.Now()); err == nil {
		t.Fatal("expected an error for mode \"pause\"")
	}
	if store.replaces != 0 {
		t.Error("an invalid mode must not write the document")
	}
}
