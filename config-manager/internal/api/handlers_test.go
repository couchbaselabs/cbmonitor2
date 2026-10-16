package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/couchbase/config-manager/internal/manager"
	"github.com/couchbase/config-manager/internal/metrics"
	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/storage"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

// memMetadata is an in-memory MetadataStorage that mirrors the Couchbase
// Server implementation's read-modify-write behaviour, with per-operation
// failures.
type memMetadata struct {
	mu      sync.Mutex
	docs    map[string]*models.SnapshotMetadata
	saveErr error
	getErr  error
	// updateHook, when set, runs at the start of every Update outside the
	// store's lock; an error fails that Update.
	updateHook func(id string) error
}

func newMemMetadata() *memMetadata {
	return &memMetadata{docs: map[string]*models.SnapshotMetadata{}}
}

func (m *memMetadata) SaveMetadata(md *models.SnapshotMetadata) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.saveErr != nil {
		return m.saveErr
	}
	cp := *md
	m.docs[md.SnapshotID] = &cp
	return nil
}

func (m *memMetadata) GetMetadata(id string) (*models.SnapshotMetadata, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.getErr != nil {
		return nil, m.getErr
	}
	md, ok := m.docs[id]
	if !ok {
		return nil, fmt.Errorf("%w for snapshot %s", storage.ErrMetadataNotFound, id)
	}
	cp := *md
	return &cp, nil
}

// Update runs fn under the store's lock, so concurrent writers never lose
// each other's changes, matching the compare-and-swap Couchbase Server
// storage.
func (m *memMetadata) Update(id string, fn func(*models.SnapshotMetadata) error) error {
	if m.updateHook != nil {
		if err := m.updateHook(id); err != nil {
			return err
		}
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.getErr != nil {
		return m.getErr
	}
	md, ok := m.docs[id]
	if !ok {
		return fmt.Errorf("%w for snapshot %s", storage.ErrMetadataNotFound, id)
	}
	cp := *md
	cp.Phases = append([]models.Phase(nil), md.Phases...)
	cp.Services = append([]string(nil), md.Services...)
	if err := fn(&cp); err != nil {
		return err
	}
	if m.saveErr != nil {
		return m.saveErr
	}
	m.docs[id] = &cp
	return nil
}

func (m *memMetadata) UpdatePhase(id, phase, mode string, at time.Time) error {
	return m.Update(id, func(md *models.SnapshotMetadata) error {
		switch mode {
		case "start":
			md.Phases = append(md.Phases, models.Phase{Label: phase, TsStart: at})
		case "end":
			if len(md.Phases) > 0 {
				md.Phases[len(md.Phases)-1].TsEnd = at.Format(time.RFC3339Nano)
			}
		}
		return nil
	})
}

func (m *memMetadata) UpdateServices(id string, services []string) error {
	return m.Update(id, func(md *models.SnapshotMetadata) error {
		md.Services = append(md.Services, services...)
		return nil
	})
}

func (m *memMetadata) EoLSnapshot(id string, at time.Time) error {
	return m.Update(id, func(md *models.SnapshotMetadata) error {
		md.TsEnd = at.Format(time.RFC3339Nano)
		return nil
	})
}

func (m *memMetadata) doc(t *testing.T, id string) *models.SnapshotMetadata {
	t.Helper()
	m.mu.Lock()
	defer m.mu.Unlock()
	md, ok := m.docs[id]
	if !ok {
		t.Fatalf("no metadata document for snapshot %s", id)
	}
	return md
}

func (m *memMetadata) Ping() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.getErr
}

func (m *memMetadata) Close() error { return nil }
func (m *memMetadata) Type() string { return "memory" }

var _ storage.MetadataStorage = (*memMetadata)(nil)

// fakeCluster serves the two Couchbase Server endpoints create collects
// metadata from. poolsBody and poolsStatus control /pools/nodes.
type fakeCluster struct {
	*httptest.Server
	poolsStatus int
	poolsBody   string
	// poolsDelay holds /pools/nodes before answering, or until the client gives up.
	poolsDelay time.Duration
}

func newFakeCluster(t *testing.T) *fakeCluster {
	t.Helper()
	c := &fakeCluster{
		poolsStatus: http.StatusOK,
		poolsBody:   `{"nodes":[{"services":["kv","index"],"version":"8.0.0-1234-enterprise"}]}`,
	}
	c.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/pools/nodes":
			if c.poolsDelay > 0 {
				select {
				case <-time.After(c.poolsDelay):
				case <-r.Context().Done():
					return
				}
			}
			w.WriteHeader(c.poolsStatus)
			_, _ = w.Write([]byte(c.poolsBody))
		case "/prometheus_sd_config":
			_, _ = w.Write([]byte(`[{"targets":["127.0.0.1:8091"],"labels":{"cluster_name":"aether_5indexes_aether","cluster_uuid":"c0ffee"}}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(c.Close)
	return c
}

func (c *fakeCluster) hostPort(t *testing.T) (string, int) {
	t.Helper()
	host, portStr, err := net.SplitHostPort(strings.TrimPrefix(c.URL, "http://"))
	if err != nil {
		t.Fatalf("split %q: %v", c.URL, err)
	}
	port, _ := strconv.Atoi(portStr)
	return host, port
}

type harness struct {
	t        *testing.T
	dir      string
	metadata *memMetadata
	handler  *Handler
	mux      *http.ServeMux
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	h := &harness{t: t, dir: t.TempDir(), metadata: newMemMetadata(), mux: http.NewServeMux()}
	h.start()
	return h
}

// start builds the handler over the harness's directory and store; calling it
// again models a restart.
func (h *harness) start() {
	h.t.Helper()
	pending, err := storage.NewPendingQueue(h.dir)
	if err != nil {
		h.t.Fatal(err)
	}
	if h.handler != nil {
		h.handler.Shutdown(context.Background())
	}
	h.handler = NewHandler(storage.NewFileStorage(h.dir), h.metadata, "vmagent", pending)
	handler := h.handler
	h.t.Cleanup(func() { handler.Shutdown(context.Background()) })
	h.mux = http.NewServeMux()
	h.mux.HandleFunc("/api/v1/snapshot", h.handler.CreateSnapshot)
	h.mux.HandleFunc("/api/v1/snapshot/", h.handler.Manager)
}

func (h *harness) setStoreDown(down bool) {
	h.metadata.mu.Lock()
	defer h.metadata.mu.Unlock()
	if down {
		h.metadata.getErr = errors.New("unambiguous timeout")
	} else {
		h.metadata.getErr = nil
	}
}

func (h *harness) do(method, path string, body interface{}) *httptest.ResponseRecorder {
	h.t.Helper()
	var buf bytes.Buffer
	switch b := body.(type) {
	case nil:
	case string:
		buf.WriteString(b)
	default:
		if err := json.NewEncoder(&buf).Encode(b); err != nil {
			h.t.Fatalf("encode body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	rec := httptest.NewRecorder()
	h.mux.ServeHTTP(rec, req)
	return rec
}

func (h *harness) scrapeFile(id string) string {
	return filepath.Join(h.dir, id+".yml")
}

func snapshotRequest(host string, port int) map[string]interface{} {
	return map[string]interface{}{
		"configs":     []map[string]interface{}{{"hostnames": []string{host}, "port": port}},
		"credentials": map[string]string{"username": "Administrator", "password": "password"},
		"label":       "http://perf.jenkins.couchbase.com/job/ares/1/",
	}
}

// createNoWait registers a snapshot against cluster and returns its id as soon
// as create responds, while cluster metadata may still be arriving.
func (h *harness) createNoWait(cluster *fakeCluster) string {
	h.t.Helper()
	host, port := cluster.hostPort(h.t)
	rec := h.do(http.MethodPost, "/api/v1/snapshot", snapshotRequest(host, port))
	if rec.Code != http.StatusCreated {
		h.t.Fatalf("create: status %d, body %q", rec.Code, rec.Body.String())
	}
	var resp models.SnapshotResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil || resp.ID == "" {
		h.t.Fatalf("create: bad response %q: %v", rec.Body.String(), err)
	}
	return resp.ID
}

// create registers a snapshot and waits for its background metadata
// collection, so the document is complete when it returns.
func (h *harness) create(cluster *fakeCluster) string {
	h.t.Helper()
	id := h.createNoWait(cluster)
	h.handler.collector.wait()
	return id
}

func TestCreateSnapshotWritesScrapeFileAndMetadata(t *testing.T) {
	h := newHarness(t)
	id := h.create(newFakeCluster(t))

	content, err := os.ReadFile(h.scrapeFile(id))
	if err != nil {
		t.Fatalf("scrape file not written: %v", err)
	}
	if !strings.Contains(string(content), "job_name: "+id) {
		t.Errorf("scrape file does not name the snapshot's job:\n%s", content)
	}

	md := h.metadata.doc(t, id)
	if md.TsEnd != "now" {
		t.Errorf("ts_end = %q, want the live sentinel \"now\"", md.TsEnd)
	}
	if md.TsStart.IsZero() {
		t.Error("ts_start was not recorded")
	}
	if md.Server != "8.0.0-1234-enterprise" {
		t.Errorf("server = %q", md.Server)
	}
	if len(md.Clusters) != 1 || md.Clusters[0].Name != "aether_5indexes_aether" || md.Clusters[0].UID != "c0ffee" {
		t.Errorf("clusters = %+v", md.Clusters)
	}
	if len(md.Services) != 2 {
		t.Errorf("services = %v, want kv and index", md.Services)
	}
	if len(md.Products) != 1 || md.Products[0] != "couchbase" {
		t.Errorf("products = %v, want [couchbase]", md.Products)
	}
}

func TestCreateSnapshotRejectsInvalidRequests(t *testing.T) {
	cluster := newFakeCluster(t)
	host, port := cluster.hostPort(t)
	cases := map[string]func(map[string]interface{}){
		"missing username": func(r map[string]interface{}) {
			r["credentials"] = map[string]string{"password": "password"}
		},
		"missing password": func(r map[string]interface{}) {
			r["credentials"] = map[string]string{"username": "Administrator"}
		},
		"missing port": func(r map[string]interface{}) {
			r["configs"] = []map[string]interface{}{{"hostnames": []string{host}}}
		},
		"no hostnames": func(r map[string]interface{}) {
			r["configs"] = []map[string]interface{}{{"hostnames": []string{}, "port": port}}
		},
		"unknown scheme": func(r map[string]interface{}) { r["scheme"] = "ftp" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t)
			req := snapshotRequest(host, port)
			mutate(req)
			rec := h.do(http.MethodPost, "/api/v1/snapshot", req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("status %d, want 400 (body %q)", rec.Code, rec.Body.String())
			}
			assertNoScrapeFiles(t, h.dir)
		})
	}

	t.Run("malformed JSON", func(t *testing.T) {
		h := newHarness(t)
		rec := h.do(http.MethodPost, "/api/v1/snapshot", "{not json")
		if rec.Code != http.StatusBadRequest {
			t.Errorf("status %d, want 400", rec.Code)
		}
		assertNoScrapeFiles(t, h.dir)
	})
}

// Metadata collection is best effort: a cluster that cannot describe itself
// must not stop its metrics from being scraped.
func TestCreateSnapshotSurvivesMetadataFailures(t *testing.T) {
	cases := map[string]func(*fakeCluster){
		"cluster returns an error": func(c *fakeCluster) {
			c.poolsStatus = http.StatusInternalServerError
			c.poolsBody = "{}"
		},
		"cluster reports no nodes": func(c *fakeCluster) { c.poolsBody = `{"nodes":[]}` },
	}
	for name, configure := range cases {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t)
			cluster := newFakeCluster(t)
			configure(cluster)
			id := h.create(cluster)

			if _, err := os.Stat(h.scrapeFile(id)); err != nil {
				t.Fatalf("scrape file not written: %v", err)
			}
			md := h.metadata.doc(t, id)
			if md.TsEnd != "now" || len(md.Clusters) != 0 {
				t.Errorf("want a base document without cluster details, got %+v", md)
			}
		})
	}

	t.Run("metadata store unavailable", func(t *testing.T) {
		h := newHarness(t)
		h.metadata.saveErr = errors.New("unambiguous timeout")
		id := h.create(newFakeCluster(t))
		if _, err := os.Stat(h.scrapeFile(id)); err != nil {
			t.Fatalf("scrape file not written: %v", err)
		}
	})
}

func TestPatchSnapshotRecordsPhasesAndRefreshesKeepalive(t *testing.T) {
	h := newHarness(t)
	id := h.create(newFakeCluster(t))
	path := "/api/v1/snapshot/" + id

	stale := time.Now().Add(-time.Hour)
	if err := os.Chtimes(h.scrapeFile(id), stale, stale); err != nil {
		t.Fatal(err)
	}

	if rec := h.do(http.MethodPatch, path, map[string]string{"phase": "load", "mode": "start"}); rec.Code != http.StatusOK {
		t.Fatalf("phase start: status %d, body %q", rec.Code, rec.Body.String())
	}
	if info, _ := os.Stat(h.scrapeFile(id)); !info.ModTime().After(stale) {
		t.Error("PATCH did not refresh the scrape file's keepalive mtime")
	}
	if rec := h.do(http.MethodPatch, path, map[string]string{"phase": "load", "mode": "end"}); rec.Code != http.StatusOK {
		t.Fatalf("phase end: status %d", rec.Code)
	}

	phases := h.metadata.doc(t, id).Phases
	if len(phases) != 1 || phases[0].Label != "load" || phases[0].TsStart.IsZero() || phases[0].TsEnd == "" {
		t.Errorf("phases = %+v, want one closed \"load\" phase", phases)
	}
}

func TestPatchSnapshotWithoutBodyIsAKeepalive(t *testing.T) {
	h := newHarness(t)
	id := h.create(newFakeCluster(t))
	stale := time.Now().Add(-time.Hour)
	if err := os.Chtimes(h.scrapeFile(id), stale, stale); err != nil {
		t.Fatal(err)
	}

	if rec := h.do(http.MethodPatch, "/api/v1/snapshot/"+id, nil); rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if info, _ := os.Stat(h.scrapeFile(id)); !info.ModTime().After(stale) {
		t.Error("keepalive did not refresh the scrape file's mtime")
	}
	if len(h.metadata.doc(t, id).Phases) != 0 {
		t.Error("a keepalive must not record a phase")
	}
}

func TestUnknownSnapshotIs404(t *testing.T) {
	h := newHarness(t)
	for _, method := range []string{http.MethodPatch, http.MethodDelete, http.MethodGet} {
		if rec := h.do(method, "/api/v1/snapshot/does-not-exist", nil); rec.Code != http.StatusNotFound {
			t.Errorf("%s: status %d, want 404", method, rec.Code)
		}
	}
	// A 404 must not leave a queued write behind.
	if h.handler.writes.pending.Len() != 0 {
		t.Error("a request for an unknown snapshot queued a metadata write")
	}
}

func TestDeleteSnapshotEndsAndRemoves(t *testing.T) {
	h := newHarness(t)
	id := h.create(newFakeCluster(t))

	if rec := h.do(http.MethodDelete, "/api/v1/snapshot/"+id, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("status %d, body %q", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(h.scrapeFile(id)); !os.IsNotExist(err) {
		t.Errorf("scrape file still present: %v", err)
	}
	if md := h.metadata.doc(t, id); md.TsEnd == "now" || md.TsEnd == "" {
		t.Errorf("ts_end = %q, want the end-of-life timestamp", md.TsEnd)
	}
}

// Scraping stops even when the end of life cannot be written; the write is
// queued and applied later with the time of the DELETE.
func TestDeleteQueuesEndOfLifeWhenTheStoreIsDown(t *testing.T) {
	h := newHarness(t)
	id := h.create(newFakeCluster(t))
	h.setStoreDown(true)

	deletedAt := time.Now()
	if rec := h.do(http.MethodDelete, "/api/v1/snapshot/"+id, nil); rec.Code != http.StatusAccepted {
		t.Fatalf("status %d, want 202", rec.Code)
	}
	answeredAt := time.Now()
	if _, err := os.Stat(h.scrapeFile(id)); !os.IsNotExist(err) {
		t.Errorf("scrape file kept although scraping must stop: %v", err)
	}

	h.setStoreDown(false)
	time.Sleep(50 * time.Millisecond)
	h.handler.writes.drain(time.Now())

	end, err := time.Parse(time.RFC3339Nano, h.metadata.doc(t, id).TsEnd)
	if err != nil {
		t.Fatalf("ts_end not recorded: %v", err)
	}
	if end.Before(deletedAt) || end.After(answeredAt) {
		t.Errorf("ts_end %v, want the DELETE's time (%v to %v), not the retry's", end, deletedAt, answeredAt)
	}
}

func TestGetSnapshot(t *testing.T) {
	h := newHarness(t)
	cluster := newFakeCluster(t)
	id := h.create(cluster)

	rec := h.do(http.MethodGet, "/api/v1/snapshot/"+id, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	var snap models.DisplaySnapshot
	if err := json.Unmarshal(rec.Body.Bytes(), &snap); err != nil {
		t.Fatal(err)
	}
	if snap.Name != id || len(snap.Urls) != 1 || !strings.HasPrefix(snap.Urls[0], cluster.URL) {
		t.Errorf("snapshot = %+v, want one SD URL on %s", snap, cluster.URL)
	}

	if rec := h.do(http.MethodGet, "/api/v1/snapshot/does-not-exist", nil); rec.Code != http.StatusNotFound {
		t.Errorf("unknown snapshot: status %d, want 404", rec.Code)
	}
}

func assertNoScrapeFiles(t *testing.T, dir string) {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".yml") {
			t.Errorf("unexpected scrape file %s left by a rejected request", e.Name())
		}
	}
}

// Create answers once the scrape file and base document exist; a slow cluster
// no longer holds the response, which is what used to trip proxy timeouts and
// client retries.
func TestCreateRespondsBeforeClusterMetadataArrives(t *testing.T) {
	h := newHarness(t)
	cluster := newFakeCluster(t)
	cluster.poolsDelay = 1500 * time.Millisecond

	start := time.Now()
	id := h.createNoWait(cluster)
	if took := time.Since(start); took > 500*time.Millisecond {
		t.Errorf("create took %v, want it to return before the slow cluster answers", took)
	}

	// The gateway needs ts_start at once.
	md := h.metadata.doc(t, id)
	if md.TsStart.IsZero() || md.TsEnd != "now" || len(md.Clusters) != 0 {
		t.Fatalf("base document = %+v, want ts_start and the live sentinel, no clusters yet", md)
	}

	h.handler.collector.wait()
	if md := h.metadata.doc(t, id); len(md.Clusters) != 1 || md.Server == "" {
		t.Errorf("after collection: clusters %v server %q", md.Clusters, md.Server)
	}
}

// A phase PATCH that lands while metadata is still being collected must
// survive the merge.
func TestCollectedMetadataKeepsAPhaseRecordedMeanwhile(t *testing.T) {
	h := newHarness(t)
	cluster := newFakeCluster(t)
	cluster.poolsDelay = 300 * time.Millisecond
	id := h.createNoWait(cluster)

	if rec := h.do(http.MethodPatch, "/api/v1/snapshot/"+id, map[string]string{"phase": "load", "mode": "start"}); rec.Code != http.StatusOK {
		t.Fatalf("phase start: status %d", rec.Code)
	}
	h.handler.collector.wait()

	md := h.metadata.doc(t, id)
	if len(md.Phases) != 1 || len(md.Clusters) != 1 {
		t.Errorf("phases %v clusters %v: want both the phase and the collected cluster", md.Phases, md.Clusters)
	}
}

func TestCollectionGivesUpOnAHangingCluster(t *testing.T) {
	h := newHarness(t)
	h.handler.collector.hostTimeout = 200 * time.Millisecond
	cluster := newFakeCluster(t)
	cluster.poolsDelay = time.Hour

	start := time.Now()
	id := h.create(cluster)
	if took := time.Since(start); took > 2*time.Second {
		t.Errorf("collection took %v despite a %v host timeout", took, h.handler.collector.hostTimeout)
	}
	if md := h.metadata.doc(t, id); md.TsEnd != "now" || len(md.Clusters) != 0 {
		t.Errorf("document = %+v, want the base document alone", md)
	}
}

// When the metadata store is down at create but back by the time collection
// finishes, the snapshot still gets its document.
func TestCollectionWritesTheWholeDocumentWhenTheBaseWriteFailed(t *testing.T) {
	h := newHarness(t)
	cluster := newFakeCluster(t)
	cluster.poolsDelay = 300 * time.Millisecond

	h.metadata.mu.Lock()
	h.metadata.saveErr = errors.New("unambiguous timeout")
	h.metadata.mu.Unlock()
	id := h.createNoWait(cluster)
	h.metadata.mu.Lock()
	h.metadata.saveErr = nil
	h.metadata.mu.Unlock()

	h.handler.collector.wait()
	md := h.metadata.doc(t, id)
	if md.TsStart.IsZero() || md.TsEnd != "now" || len(md.Clusters) != 1 || md.Label == "" {
		t.Errorf("document = %+v, want base fields and collected clusters", md)
	}
}

func TestShutdownCancelsCollectionItCannotWaitFor(t *testing.T) {
	h := newHarness(t)
	cluster := newFakeCluster(t)
	cluster.poolsDelay = time.Hour
	h.createNoWait(cluster)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	h.handler.Shutdown(ctx)
	h.handler.collector.wait()
	if took := time.Since(start); took > 2*time.Second {
		t.Errorf("shutdown left collection running for %v", took)
	}
}

func (h *harness) put(id string, cluster *fakeCluster) *httptest.ResponseRecorder {
	h.t.Helper()
	host, port := cluster.hostPort(h.t)
	return h.do(http.MethodPut, "/api/v1/snapshot/"+id, snapshotRequest(host, port))
}

func TestPutCreatesThenReturnsTheSameSnapshot(t *testing.T) {
	h := newHarness(t)
	cluster := newFakeCluster(t)
	const id = "jenkins-ares-52485"

	if rec := h.put(id, cluster); rec.Code != http.StatusCreated {
		t.Fatalf("first PUT: status %d, body %q", rec.Code, rec.Body.String())
	}
	h.handler.collector.wait()
	before, _ := os.ReadFile(h.scrapeFile(id))
	started := h.metadata.doc(t, id).TsStart

	stale := time.Now().Add(-time.Hour)
	_ = os.Chtimes(h.scrapeFile(id), stale, stale)
	rec := h.put(id, cluster)
	if rec.Code != http.StatusOK {
		t.Fatalf("repeat PUT: status %d, want 200", rec.Code)
	}
	var resp models.SnapshotResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.ID != id {
		t.Errorf("repeat PUT returned id %q", resp.ID)
	}

	after, _ := os.ReadFile(h.scrapeFile(id))
	if string(before) != string(after) {
		t.Error("a repeat PUT rewrote the scrape file")
	}
	if got := h.metadata.doc(t, id).TsStart; !got.Equal(started) {
		t.Errorf("ts_start moved from %v to %v", started, got)
	}
	if info, _ := os.Stat(h.scrapeFile(id)); !info.ModTime().After(stale) {
		t.Error("a repeat PUT should count as a keepalive")
	}
	matches, _ := filepath.Glob(filepath.Join(h.dir, "*.yml"))
	if len(matches) != 1 {
		t.Errorf("%d scrape files, want 1", len(matches))
	}
}

// A client whose keepalives lapsed re-registers with the same ID; its snapshot
// comes back with its start time and phases intact.
func TestPutReopensASweptSnapshot(t *testing.T) {
	h := newHarness(t)
	cluster := newFakeCluster(t)
	const id = "jenkins-hera-kv-3421"

	h.put(id, cluster)
	h.handler.collector.wait()
	h.do(http.MethodPatch, "/api/v1/snapshot/"+id, map[string]string{"phase": "load", "mode": "start"})
	started := h.metadata.doc(t, id).TsStart

	// The manager loop sweeps it: end of life recorded, file removed.
	if err := h.metadata.EoLSnapshot(id, time.Now()); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(h.scrapeFile(id)); err != nil {
		t.Fatal(err)
	}

	if rec := h.put(id, cluster); rec.Code != http.StatusOK {
		t.Fatalf("re-register: status %d, want 200", rec.Code)
	}
	if _, err := os.Stat(h.scrapeFile(id)); err != nil {
		t.Fatalf("scrape file not restored: %v", err)
	}
	md := h.metadata.doc(t, id)
	if md.TsEnd != "now" || !md.TsStart.Equal(started) || len(md.Phases) != 1 {
		t.Errorf("reopened document = %+v, want ts_end now, the original ts_start and the phase", md)
	}
}

func TestPutRejectsInvalidIDs(t *testing.T) {
	h := newHarness(t)
	cluster := newFakeCluster(t)
	for _, id := range []string{"has%20space", "dots.are.out", strings.Repeat("a", 129), "semi%3Bcolon"} {
		if rec := h.put(id, cluster); rec.Code != http.StatusBadRequest {
			t.Errorf("PUT %q: status %d, want 400", id, rec.Code)
		}
	}
	assertNoScrapeFiles(t, h.dir)
}

// A retry racing the original request must not produce a second snapshot.
func TestConcurrentPutsCreateOneSnapshot(t *testing.T) {
	h := newHarness(t)
	cluster := newFakeCluster(t)
	const id = "jenkins-race-1"

	// Request bodies are built first and released together, and every PUT
	// pauses after looking the snapshot up, as a Couchbase Server round trip
	// would, so without serialisation several would find it missing and
	// create it.
	testHookAfterMetadataLookup = func() { time.Sleep(5 * time.Millisecond) }
	t.Cleanup(func() { testHookAfterMetadataLookup = nil })
	const n = 20
	host, port := cluster.hostPort(t)
	body, _ := json.Marshal(snapshotRequest(host, port))
	gate := make(chan struct{})
	codes := make(chan int, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := httptest.NewRequest(http.MethodPut, "/api/v1/snapshot/"+id, bytes.NewReader(body))
			rec := httptest.NewRecorder()
			<-gate
			h.mux.ServeHTTP(rec, req)
			codes <- rec.Code
		}()
	}
	close(gate)
	wg.Wait()
	close(codes)
	h.handler.collector.wait()

	counts := map[int]int{}
	for c := range codes {
		counts[c]++
	}
	if counts[http.StatusCreated] != 1 || counts[http.StatusOK] != n-1 {
		t.Errorf("status counts %v, want one 201 and %d 200", counts, n-1)
	}
}

// A phase that cannot be recorded is queued and the PATCH still succeeds; a
// later phase end queues behind it, so the two apply in order.
func TestPatchQueuesWhileTheStoreIsDown(t *testing.T) {
	h := newHarness(t)
	id := h.create(newFakeCluster(t))
	path := "/api/v1/snapshot/" + id

	h.setStoreDown(true)
	startedAt := time.Now()
	if rec := h.do(http.MethodPatch, path, map[string]string{"phase": "access", "mode": "start"}); rec.Code != http.StatusAccepted {
		t.Fatalf("phase start: status %d, want 202", rec.Code)
	}
	answeredAt := time.Now()
	h.setStoreDown(false)
	time.Sleep(20 * time.Millisecond)
	if rec := h.do(http.MethodPatch, path, map[string]string{"phase": "access", "mode": "end"}); rec.Code != http.StatusAccepted {
		t.Errorf("phase end with a start still queued: status %d, want 202", rec.Code)
	}
	if rec := h.do(http.MethodPatch, path, nil); rec.Code != http.StatusOK {
		t.Errorf("keepalive during the backlog: status %d, want 200", rec.Code)
	}

	time.Sleep(20 * time.Millisecond)
	h.handler.writes.drain(time.Now())

	phases := h.metadata.doc(t, id).Phases
	if len(phases) != 1 || phases[0].TsEnd == "" {
		t.Fatalf("phases = %+v, want one closed phase", phases)
	}
	if got := phases[0].TsStart; got.Before(startedAt) || got.After(answeredAt) {
		t.Errorf("phase start %v, want the PATCH's time (%v to %v), not the retry's", got, startedAt, answeredAt)
	}
	if h.handler.writes.pending.Len() != 0 {
		t.Error("queue not empty after a successful drain")
	}
}

func TestQueuedWritesSurviveARestart(t *testing.T) {
	h := newHarness(t)
	id := h.create(newFakeCluster(t))
	h.setStoreDown(true)
	if rec := h.do(http.MethodPatch, "/api/v1/snapshot/"+id, map[string]string{"phase": "load", "mode": "start"}); rec.Code != http.StatusAccepted {
		t.Fatalf("status %d, want 202", rec.Code)
	}

	h.start()
	h.setStoreDown(false)
	h.handler.writes.drain(time.Now())

	if phases := h.metadata.doc(t, id).Phases; len(phases) != 1 {
		t.Errorf("phases = %+v after restart, want the queued phase applied", phases)
	}
}

// expire does what the manager loop does to a stale snapshot.
func (h *harness) expire(id string) {
	h.t.Helper()
	if err := storage.NewFileStorage(h.dir).Expire(id, time.Now()); err != nil {
		h.t.Fatal(err)
	}
	h.handler.EndSnapshot(id, time.Now())
}

// A test whose keepalives were only late gets its snapshot back on the next
// keepalive, with no re-registration.
func TestLateKeepaliveRestoresAnExpiredSnapshot(t *testing.T) {
	h := newHarness(t)
	id := h.create(newFakeCluster(t))
	h.expire(id)
	if md := h.metadata.doc(t, id); md.TsEnd == "now" {
		t.Fatal("setup: the sweep should have recorded an end of life")
	}

	if rec := h.do(http.MethodPatch, "/api/v1/snapshot/"+id, nil); rec.Code != http.StatusOK {
		t.Fatalf("late keepalive: status %d, want 200", rec.Code)
	}
	if _, err := os.Stat(h.scrapeFile(id)); err != nil {
		t.Errorf("snapshot not back in service: %v", err)
	}
	if md := h.metadata.doc(t, id); md.TsEnd != "now" {
		t.Errorf("ts_end = %q, want the snapshot reopened", md.TsEnd)
	}
}

func TestDeleteOfAnExpiredSnapshotClearsItsHeldFile(t *testing.T) {
	h := newHarness(t)
	id := h.create(newFakeCluster(t))
	h.expire(id)

	if rec := h.do(http.MethodDelete, "/api/v1/snapshot/"+id, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("status %d, want 204", rec.Code)
	}
	if storage.NewFileStorage(h.dir).IsHeld(id) {
		t.Error("held scrape file, which carries cluster credentials, was left behind")
	}
}

func TestPutOverAnExpiredSnapshotReplacesTheHeldCopy(t *testing.T) {
	h := newHarness(t)
	cluster := newFakeCluster(t)
	const id = "jenkins-held-1"
	h.put(id, cluster)
	h.handler.collector.wait()
	h.expire(id)

	if rec := h.put(id, cluster); rec.Code != http.StatusOK {
		t.Fatalf("re-register: status %d, want 200", rec.Code)
	}
	if storage.NewFileStorage(h.dir).IsHeld(id) {
		t.Error("the held copy should be discarded once the snapshot is re-registered")
	}
	if md := h.metadata.doc(t, id); md.TsEnd != "now" {
		t.Errorf("ts_end = %q, want the snapshot reopened", md.TsEnd)
	}
}

func TestMetadataFailuresAreCounted(t *testing.T) {
	h := newHarness(t)
	cluster := newFakeCluster(t)
	cluster.poolsStatus = http.StatusInternalServerError

	failures := testutil.ToFloat64(metrics.MetadataCollectionFailures)
	queued := testutil.ToFloat64(metrics.MetadataWritesQueued)
	id := h.create(cluster)
	if got := testutil.ToFloat64(metrics.MetadataCollectionFailures) - failures; got != 1 {
		t.Errorf("collection failures counted = %v, want 1", got)
	}

	h.setStoreDown(true)
	h.do(http.MethodPatch, "/api/v1/snapshot/"+id, map[string]string{"phase": "load", "mode": "start"})
	if got := testutil.ToFloat64(metrics.MetadataWritesQueued) - queued; got != 1 {
		t.Errorf("queued writes counted = %v, want 1", got)
	}
	if got := testutil.ToFloat64(metrics.PendingMetadataWrites); got != 1 {
		t.Errorf("pending writes gauge = %v, want 1", got)
	}
}

// stallFirstUpdate makes the store's next Update wait until the returned
// release is called, then fail with failWith (nil lets it succeed). entered is
// closed once that Update is waiting. Later Updates are unaffected.
func (h *harness) stallFirstUpdate(failWith error) (entered <-chan struct{}, release func()) {
	in, out := make(chan struct{}), make(chan struct{})
	var first atomic.Bool
	h.metadata.updateHook = func(string) error {
		if !first.CompareAndSwap(false, true) {
			return nil
		}
		close(in)
		<-out
		return failWith
	}
	return in, func() { close(out) }
}

// A phase end must not apply while the phase start before it is still on its
// way to the store: if the start then fails and queues, replaying it last
// leaves the phase open.
func TestWritesForOneSnapshotApplyInOrder(t *testing.T) {
	h := newHarness(t)
	id := h.create(newFakeCluster(t))
	path := "/api/v1/snapshot/" + id
	entered, release := h.stallFirstUpdate(errors.New("unambiguous timeout"))

	start := make(chan int)
	go func() {
		start <- h.do(http.MethodPatch, path, map[string]string{"phase": "access", "mode": "start"}).Code
	}()
	<-entered
	end := make(chan int)
	go func() {
		end <- h.do(http.MethodPatch, path, map[string]string{"phase": "access", "mode": "end"}).Code
	}()
	select {
	case code := <-end:
		t.Fatalf("phase end answered %d while its start was still being written", code)
	case <-time.After(50 * time.Millisecond):
	}
	release()

	if code := <-start; code != http.StatusAccepted {
		t.Errorf("phase start: status %d, want 202", code)
	}
	if code := <-end; code != http.StatusAccepted {
		t.Errorf("phase end behind a queued start: status %d, want 202", code)
	}
	h.handler.writes.drain(time.Now())
	if phases := h.metadata.doc(t, id).Phases; len(phases) != 1 || phases[0].TsEnd == "" {
		t.Errorf("phases = %+v, want one closed phase", phases)
	}
}

// A keepalive that arrives while the sweep is recording a snapshot's end of
// life restores the snapshot after that end of life, so it stays open.
func TestKeepaliveDuringTheSweepLeavesTheSnapshotOpen(t *testing.T) {
	h := newHarness(t)
	id := h.create(newFakeCluster(t))
	stale := time.Now().Add(-10 * time.Minute)
	if err := os.Chtimes(h.scrapeFile(id), stale, stale); err != nil {
		t.Fatal(err)
	}
	sweeper := &manager.Sweeper{
		Files:          storage.NewFileStorage(h.dir),
		End:            h.handler.EndSnapshot,
		Lock:           h.handler.LockSnapshot,
		StaleThreshold: 5 * time.Minute,
		HoldPeriod:     time.Hour,
	}
	entered, release := h.stallFirstUpdate(nil)

	swept := make(chan error)
	go func() { swept <- sweeper.Sweep() }()
	<-entered
	keepalive := make(chan int)
	go func() { keepalive <- h.do(http.MethodPatch, "/api/v1/snapshot/"+id, nil).Code }()
	time.Sleep(50 * time.Millisecond)
	release()

	if err := <-swept; err != nil {
		t.Fatal(err)
	}
	if code := <-keepalive; code != http.StatusOK {
		t.Fatalf("keepalive: status %d, want 200", code)
	}
	if _, err := os.Stat(h.scrapeFile(id)); err != nil {
		t.Errorf("snapshot not in service: %v", err)
	}
	if md := h.metadata.doc(t, id); md.TsEnd != "now" {
		t.Errorf("ts_end = %q, want the snapshot open", md.TsEnd)
	}
}
