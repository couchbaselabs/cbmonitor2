package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/couchbase/cbmonitor/pkg/models"
)

// annotationFixture is one row the fake /api/annotations GET returns.
type annotationFixture struct {
	ID      int64
	Time    int64
	TimeEnd int64
	Text    string
	Tags    []string
}

// fakeAnnotationsAPI simulates just enough of Grafana's annotations API
// for phaseAnnotationSyncer.sync to exercise its diff/delete/create paths.
// All handlers are safe for concurrent use since sync fans out deletes
// and creates across goroutines.
type fakeAnnotationsAPI struct {
	mu       sync.Mutex
	existing []annotationFixture
	deletes  []int64
	creates  []annotationFixture
	nextID   int64
	listErr  int // non-zero status forces the GET to fail
}

func newFakeAnnotationsAPI(existing ...annotationFixture) *fakeAnnotationsAPI {
	return &fakeAnnotationsAPI{existing: existing, nextID: 1000}
}

func (f *fakeAnnotationsAPI) server() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/annotations":
			f.mu.Lock()
			defer f.mu.Unlock()
			if f.listErr != 0 {
				w.WriteHeader(f.listErr)
				return
			}
			type item struct {
				ID      int64    `json:"id"`
				Time    int64    `json:"time"`
				TimeEnd int64    `json:"timeEnd"`
				Text    string   `json:"text"`
				Tags    []string `json:"tags"`
			}
			items := make([]item, 0, len(f.existing))
			for _, e := range f.existing {
				items = append(items, item{ID: e.ID, Time: e.Time, TimeEnd: e.TimeEnd, Text: e.Text, Tags: e.Tags})
			}
			_ = json.NewEncoder(w).Encode(items)
		case r.Method == http.MethodDelete:
			f.mu.Lock()
			defer f.mu.Unlock()
			var id int64
			_, _ = fmt.Sscanf(r.URL.Path, "/api/annotations/%d", &id)
			f.deletes = append(f.deletes, id)
			w.WriteHeader(http.StatusOK)
		case r.Method == http.MethodPost && r.URL.Path == "/api/annotations":
			f.mu.Lock()
			defer f.mu.Unlock()
			var body struct {
				Time    int64    `json:"time"`
				TimeEnd int64    `json:"timeEnd"`
				Text    string   `json:"text"`
				Tags    []string `json:"tags"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			f.creates = append(f.creates, annotationFixture{ID: f.nextID, Time: body.Time, TimeEnd: body.TimeEnd, Text: body.Text, Tags: body.Tags})
			f.nextID++
			w.WriteHeader(http.StatusOK)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
}

func (f *fakeAnnotationsAPI) deleteCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.deletes)
}

func (f *fakeAnnotationsAPI) createCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.creates)
}

func mkPhase(label string, startMs, endMs int64) models.Phase {
	return models.Phase{
		Label:   label,
		TSStart: time.UnixMilli(startMs).UTC().Format(time.RFC3339),
		TSEnd:   time.UnixMilli(endMs).UTC().Format(time.RFC3339),
	}
}

func TestSync_noOpWhenAlreadyMatching(t *testing.T) {
	// One phase, and an existing annotation whose content already matches
	// exactly what sync() would compute for it.
	phase := mkPhase("access", 1000, 2000)
	fake := newFakeAnnotationsAPI(annotationFixture{
		ID: 1, Time: 1000, TimeEnd: 2000, Text: "access",
		Tags: []string{phaseAnnotationTag, "job:snap-1", "phaseidx:0"},
	})
	srv := fake.server()
	defer srv.Close()

	syncer := &phaseAnnotationSyncer{httpClient: srv.Client(), appURL: srv.URL, saToken: "t"}
	result, err := syncer.sync(context.Background(), "snap-1", []models.Phase{phase})
	if err != nil {
		t.Fatalf("sync: %v", err)
	}

	if result.Deleted != 0 || result.Created != 0 || result.Unchanged != 1 {
		t.Errorf("result = %+v, want {Deleted:0 Created:0 Unchanged:1}", result)
	}
	if fake.deleteCount() != 0 || fake.createCount() != 0 {
		t.Errorf("expected no delete/create HTTP calls, got deletes=%d creates=%d", fake.deleteCount(), fake.createCount())
	}
}

func TestSync_createsMissingAndDeletesStale(t *testing.T) {
	// Existing has a stale phase (window changed) that's no longer desired,
	// plus one that already matches. Desired adds a brand-new phase too.
	matching := mkPhase("access", 1000, 2000)
	newPhase := mkPhase("drain", 3000, 4000)

	fake := newFakeAnnotationsAPI(
		annotationFixture{ID: 1, Time: 1000, TimeEnd: 2000, Text: "access", Tags: []string{phaseAnnotationTag, "job:snap-1", "phaseidx:0"}},
		annotationFixture{ID: 2, Time: 500, TimeEnd: 900, Text: "access", Tags: []string{phaseAnnotationTag, "job:snap-1", "phaseidx:0"}}, // stale window
	)
	srv := fake.server()
	defer srv.Close()

	syncer := &phaseAnnotationSyncer{httpClient: srv.Client(), appURL: srv.URL, saToken: "t"}
	result, err := syncer.sync(context.Background(), "snap-1", []models.Phase{matching, newPhase})
	if err != nil {
		t.Fatalf("sync: %v", err)
	}

	if result.Deleted != 1 {
		t.Errorf("Deleted = %d, want 1 (the stale window)", result.Deleted)
	}
	if result.Created != 1 {
		t.Errorf("Created = %d, want 1 (the new phase)", result.Created)
	}
	if result.Unchanged != 1 {
		t.Errorf("Unchanged = %d, want 1 (the matching phase)", result.Unchanged)
	}
	if fake.deleteCount() != 1 || fake.deletes[0] != 2 {
		t.Errorf("expected exactly one delete of id=2, got %v", fake.deletes)
	}
	if fake.createCount() != 1 || fake.creates[0].Text != "drain" {
		t.Errorf("expected exactly one create for 'drain', got %v", fake.creates)
	}
}

func TestSync_legacyAnnotationWithoutColorTagAlwaysDeleted(t *testing.T) {
	phase := mkPhase("access", 1000, 2000)
	fake := newFakeAnnotationsAPI(annotationFixture{
		ID: 1, Time: 1000, TimeEnd: 2000, Text: "access",
		Tags: []string{phaseAnnotationTag, "job:snap-1"}, // no phaseidx tag
	})
	srv := fake.server()
	defer srv.Close()

	syncer := &phaseAnnotationSyncer{httpClient: srv.Client(), appURL: srv.URL, saToken: "t"}
	result, err := syncer.sync(context.Background(), "snap-1", []models.Phase{phase})
	if err != nil {
		t.Fatalf("sync: %v", err)
	}

	if result.Deleted != 1 || result.Created != 1 {
		t.Errorf("result = %+v, want a delete+recreate since the legacy entry can't be trusted to match", result)
	}
}

func TestSync_emptyPhasesDeletesAllExisting(t *testing.T) {
	fake := newFakeAnnotationsAPI(
		annotationFixture{ID: 1, Time: 1000, TimeEnd: 2000, Text: "access", Tags: []string{phaseAnnotationTag, "job:snap-1", "phaseidx:0"}},
		annotationFixture{ID: 2, Time: 3000, TimeEnd: 4000, Text: "drain", Tags: []string{phaseAnnotationTag, "job:snap-1", "phaseidx:1"}},
	)
	srv := fake.server()
	defer srv.Close()

	syncer := &phaseAnnotationSyncer{httpClient: srv.Client(), appURL: srv.URL, saToken: "t"}
	result, err := syncer.sync(context.Background(), "snap-1", nil)
	if err != nil {
		t.Fatalf("sync: %v", err)
	}

	if result.Deleted != 2 || result.Created != 0 {
		t.Errorf("result = %+v, want {Deleted:2 Created:0}", result)
	}
}

func TestSync_listErrorPropagates(t *testing.T) {
	fake := newFakeAnnotationsAPI()
	fake.listErr = http.StatusInternalServerError
	srv := fake.server()
	defer srv.Close()

	syncer := &phaseAnnotationSyncer{httpClient: srv.Client(), appURL: srv.URL, saToken: "t"}
	if _, err := syncer.sync(context.Background(), "snap-1", nil); err == nil {
		t.Fatal("expected error when listing existing annotations fails")
	}
}

func TestParseColorIdxTag(t *testing.T) {
	cases := []struct {
		tags    []string
		wantIdx int
		wantOK  bool
	}{
		{[]string{"cbmonitor-phase", "job:x", "phaseidx:3"}, 3, true},
		{[]string{"cbmonitor-phase", "job:x"}, 0, false},
		{[]string{"phaseidx:notanumber"}, 0, false},
		{nil, 0, false},
	}
	for _, c := range cases {
		idx, ok := parseColorIdxTag(c.tags)
		if idx != c.wantIdx || ok != c.wantOK {
			t.Errorf("parseColorIdxTag(%v) = (%d, %v), want (%d, %v)", c.tags, idx, ok, c.wantIdx, c.wantOK)
		}
	}
}
