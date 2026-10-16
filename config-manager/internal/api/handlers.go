package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/metrics"
	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/presets"
	"github.com/couchbase/config-manager/internal/products"
	"github.com/couchbase/config-manager/internal/storage"
)

// Handler handles HTTP requests for the config-manager service
type Handler struct {
	storage         *storage.FileStorage
	metadataStorage storage.MetadataStorage
	agentType       string
	collector       *metadataCollector
	writes          *metadataWrites

	// locks serialise every change to one snapshot, so two concurrent PUTs (a
	// retry racing the original) produce one snapshot, and metadata writes
	// apply in the order the client made them.
	locks snapshotLocks
}

// NewHandler creates the API handler. Metadata writes that fail are queued in
// pending and retried in the background until Shutdown.
func NewHandler(fs *storage.FileStorage, metadataStorage storage.MetadataStorage, agentType string, pending *storage.PendingQueue) *Handler {
	return &Handler{
		storage:         fs,
		metadataStorage: metadataStorage,
		agentType:       agentType,
		collector:       newMetadataCollector(metadataStorage),
		writes:          newMetadataWrites(metadataStorage, pending),
	}
}

// LockSnapshot blocks until no request is changing id and returns the function
// that releases it. The sweep holds it while expiring a snapshot, so a late
// keepalive restores the snapshot either before the sweep looks or after its
// end of life is recorded, never in between.
func (h *Handler) LockSnapshot(id string) (unlock func()) {
	return h.locks.lock(id)
}

// EndSnapshot records id's end of life at at, queueing the write if the
// metadata store cannot take it now. It reports whether it was applied now.
// The caller holds LockSnapshot(id).
func (h *Handler) EndSnapshot(id string, at time.Time) bool {
	return h.writes.writeOrQueue(id, storage.PendingOp{Op: storage.OpEnd, At: at})
}

// Shutdown stops retrying queued writes and waits for background metadata
// collection until ctx ends, then cancels whatever is still running. Queued
// writes stay on disk for the next start.
func (h *Handler) Shutdown(ctx context.Context) {
	h.writes.stop()
	h.collector.shutdown(ctx)
}

// CreateSnapshot handles POST /api/v1/snapshot, registering a snapshot under a
// new random ID. Use PUT /api/v1/snapshot/{id} to choose the ID and make
// retries safe.
func (h *Handler) CreateSnapshot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	req, ok := h.decodeSnapshotRequest(w, r)
	if !ok {
		return
	}
	id, err := h.storage.SaveSnapshot(clusterMap(req), h.agentType)
	if err != nil {
		http.Error(w, "Failed to save snapshot: "+err.Error(), http.StatusInternalServerError)
		return
	}
	metrics.SnapshotsCreated.Inc()
	h.startMetadata(id, req)
	writeSnapshotResponse(w, http.StatusCreated, id)
}

// PutSnapshot handles PUT /api/v1/snapshot/{id}: create the snapshot, or
// return it if it already exists.
//
//   - 201 when the snapshot is new.
//   - 200 when a scrape file already exists. Nothing is rewritten, and the
//     call counts as a keepalive, so a client retrying a create it never saw
//     the answer to gets the same snapshot back instead of a duplicate.
//   - 200 when the scrape file had been swept but the snapshot's metadata
//     exists: the file is written again and the snapshot reopened, keeping its
//     start time and recorded phases. This is how a client re-registers after
//     its keepalives lapsed.
func (h *Handler) PutSnapshot(w http.ResponseWriter, r *http.Request, id string) {
	if !storage.ValidSnapshotID(id) {
		http.Error(w, "Invalid snapshot ID: use 1 to 128 of A-Z, a-z, 0-9, '_' and '-'", http.StatusBadRequest)
		return
	}
	req, ok := h.decodeSnapshotRequest(w, r)
	if !ok {
		return
	}

	defer h.locks.lock(id)()

	exists, err := h.storage.Exists(id)
	if err != nil {
		http.Error(w, "Failed to check snapshot: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if exists {
		if err := h.storage.PatchSnapshot(id); err != nil {
			http.Error(w, "Failed to refresh snapshot: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeSnapshotResponse(w, http.StatusOK, id)
		return
	}

	wasHeld := h.storage.IsHeld(id)
	if err := h.storage.SaveSnapshotWithID(id, clusterMap(req), h.agentType); err != nil {
		http.Error(w, "Failed to save snapshot: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if wasHeld {
		// The file just written from the request replaces the held copy.
		if err := h.storage.DiscardHeld(id); err != nil {
			logger.Warn("Failed to discard a held snapshot after re-registration", "id", id, "error", err)
		}
		metrics.SnapshotsRestored.Inc()
	} else {
		metrics.SnapshotsCreated.Inc()
	}

	existing, err := h.metadataStorage.GetMetadata(id)
	if hook := testHookAfterMetadataLookup; hook != nil {
		hook()
	}
	switch {
	case err == nil && existing != nil:
		// Reopen. The queue keeps this ordered after any write still pending
		// from before the sweep, such as its end of life.
		h.writes.writeOrQueue(id, storage.PendingOp{Op: storage.OpReopen, At: time.Now()})
		if len(existing.Clusters) == 0 {
			h.collector.collect(existing, req)
		}
		writeSnapshotResponse(w, http.StatusOK, id)
	case err == nil || errors.Is(err, storage.ErrMetadataNotFound):
		h.startMetadata(id, req)
		writeSnapshotResponse(w, http.StatusCreated, id)
	default:
		// The store cannot say whether the snapshot existed. Queue a reopen in
		// case it did; collection writes the whole document if it did not.
		logger.Warn("Cannot read metadata for a re-registered snapshot", "id", id, "error", err)
		h.writes.writeOrQueue(id, storage.PendingOp{Op: storage.OpReopen, At: time.Now()})
		h.collector.collect(newBaseMetadata(id, req), req)
		writeSnapshotResponse(w, http.StatusCreated, id)
	}
}

// testHookAfterMetadataLookup, when set by a test, runs between PUT's metadata
// lookup and its write, standing in for the store's round trip: the window in
// which two racing creates would both find no snapshot and both create one.
var testHookAfterMetadataLookup func()

func (h *Handler) decodeSnapshotRequest(w http.ResponseWriter, r *http.Request) (*models.SnapshotRequest, bool) {
	var req models.SnapshotRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return nil, false
	}
	if err := h.validateSnapshotRequest(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return nil, false
	}
	return &req, true
}

// startMetadata writes a new snapshot's base document and starts collecting
// its cluster metadata. The base document is written before responding: the
// gateway resolves a snapshot's time window from ts_start, so it has to exist
// as soon as the client starts querying. Cluster details take one or more
// round trips per host and are merged in when they arrive.
func (h *Handler) startMetadata(id string, req *models.SnapshotRequest) {
	base := newBaseMetadata(id, req)
	if err := h.metadataStorage.SaveMetadata(base); err != nil {
		logger.Warn("Warning: Failed to save metadata", "error", err)
	} else {
		logger.Info("Successfully saved metadata for snapshot", "id", id, "customPanels", len(base.CustomPanels))
	}
	h.collector.collect(base, req)
}

func newBaseMetadata(id string, req *models.SnapshotRequest) *models.SnapshotMetadata {
	return &models.SnapshotMetadata{
		SnapshotID:   id,
		TsStart:      time.Now(),
		TsEnd:        "now",
		Label:        req.Label,
		CustomPanels: presets.BuildCustomPanels(req),
		Services:     []string{},
		Products:     collectProducts(req.Configs),
	}
}

// clusterMap converts a request into the untyped shape the scrape-config
// generator consumes.
func clusterMap(req *models.SnapshotRequest) map[string]interface{} {
	configs := make([]interface{}, len(req.Configs))
	for i, config := range req.Configs {
		configs[i] = map[string]interface{}{
			"hostnames":         config.Hostnames,
			"type":              config.Type,
			"port":              config.Port,
			"product":           config.Product,
			"sd_path":           config.SDPath,
			"scheme":            config.Scheme,
			"use_alt_addresses": config.UseAltAddresses,
		}
	}
	return map[string]interface{}{
		"configs": configs,
		"credentials": map[string]interface{}{
			"username": req.Credentials.Username,
			"password": req.Credentials.Password,
		},
		"scheme": req.Scheme,
	}
}

func writeSnapshotResponse(w http.ResponseWriter, status int, id string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(models.SnapshotResponse{ID: id})
}

// collectProducts returns the distinct, order-preserving set of products
// across the request's configs. The validator has already defaulted each
// SD config's product to "couchbase", so a typical Couchbase snapshot
// yields ["couchbase"]; a mixed snapshot yields e.g.
// ["couchbase","syncgateway"].
// Blank products (e.g. a static config with no product) are skipped.
//
// A registered product's implied products follow it, so
// `product: "appservice"` yields ["appservice","syncgateway"].
func collectProducts(configs []models.ConfigObject) []string {
	seen := make(map[string]struct{}, len(configs))
	out := make([]string, 0, len(configs))
	add := func(name string) {
		if name == "" {
			return
		}
		if _, ok := seen[name]; ok {
			return
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}
	for _, c := range configs {
		add(c.Product)
		if p := products.Get(c.Product); p != nil {
			for _, implied := range p.Implies {
				add(implied)
			}
		}
	}
	return out
}

// validateSnapshotRequest validates the snapshot request
func (h *Handler) validateSnapshotRequest(req *models.SnapshotRequest) error {
	if req.Scheme == "" {
		req.Scheme = "http"
	} else if req.Scheme != "http" && req.Scheme != "https" {
		return &ValidationError{Field: "scheme", Message: "scheme must be either 'http' or 'https'"}
	}

	for i := range req.Configs {
		cfg := &req.Configs[i]

		if len(cfg.Hostnames) == 0 {
			return &ValidationError{Field: "configs.hostnames", Message: "at least one cluster/hostname is required"}
		}
		// TO DO: add validation to check against non existent Types
		if cfg.Type == "" {
			cfg.Type = "sd"
		}
		if cfg.Port == 0 {
			return &ValidationError{Field: "configs.port", Message: "port is required"}
		}

		// SD targets without an explicit product default to couchbase.
		// We need *some* path: either caller-supplied (sd_path) or
		// provided by the product registry. Reject when neither is set.
		if cfg.Type == "sd" {
			cfg.SDPath = strings.TrimSpace(cfg.SDPath)
			if cfg.Product == "" {
				cfg.Product = "couchbase"
			}
			if cfg.SDPath != "" && !strings.HasPrefix(cfg.SDPath, "/") {
				return &ValidationError{Field: "configs.sd_path", Message: "sd_path must start with '/'"}
			}
			if cfg.SDPath == "" {
				p := products.Get(cfg.Product)
				if p == nil || p.ResolveSDPath == nil {
					return &ValidationError{Field: "configs.sd_path", Message: fmt.Sprintf("sd_path is required (product %q has no default SD path)", cfg.Product)}
				}
			}
		}

		if cfg.Scheme == "" {
			cfg.Scheme = req.Scheme
		} else if cfg.Scheme != "http" && cfg.Scheme != "https" {
			return &ValidationError{Field: "configs.scheme", Message: "scheme must be either 'http' or 'https'"}
		}
	}

	if req.Credentials.Username == "" {
		return &ValidationError{Field: "credentials.username", Message: "username is required"}
	}

	if req.Credentials.Password == "" {
		return &ValidationError{Field: "credentials.password", Message: "password is required"}
	}

	return nil
}

// ValidationError represents a validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (e *ValidationError) Error() string {
	return e.Message
}

// Manager routes /api/v1/snapshot/{id}.
//
// Status codes clients can rely on: 404 when the snapshot has no scrape file;
// 202 when the scrape file was updated but a metadata write had to be queued
// (the metadata store was unavailable, or the document does not exist yet),
// in which case it is retried in the background with the original timestamp.
func (h *Handler) Manager(w http.ResponseWriter, r *http.Request) {
	id, ok := snapshotIDFromPath(r.URL.Path)
	if !ok {
		http.Error(w, "Missing snapshot ID", http.StatusBadRequest)
		return
	}
	switch r.Method {
	case http.MethodGet:
		h.GetSnapshotRequest(w, r, id)
	case http.MethodPut:
		h.PutSnapshot(w, r, id)
	case http.MethodDelete:
		h.DeleteSnapshotRequest(w, r, id)
	case http.MethodPatch:
		h.PatchSnapshotRequest(w, r, id)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func snapshotIDFromPath(path string) (string, bool) {
	segments := strings.Split(path, "/")
	if len(segments) < 4 || segments[3] == "" {
		return "", false
	}
	return segments[len(segments)-1], true
}

func (h *Handler) GetSnapshotRequest(w http.ResponseWriter, r *http.Request, snapshotID string) {
	snapshot, err := h.storage.GetSnapshot(snapshotID)
	if err != nil {
		if errors.Is(err, storage.ErrSnapshotNotFound) {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(snapshot); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

// DeleteSnapshotRequest ends a snapshot: its end of life is recorded and its
// scrape file removed. The file goes regardless of the metadata store, so
// scraping always stops; an end of life that cannot be written now is queued.
func (h *Handler) DeleteSnapshotRequest(w http.ResponseWriter, r *http.Request, snapshotID string) {
	defer h.locks.lock(snapshotID)()
	exists, err := h.storage.Exists(snapshotID)
	if err != nil {
		http.Error(w, "Failed to check snapshot: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if !exists {
		// Already expired by the sweep, which recorded its end of life; the
		// client's DELETE just finishes the cleanup.
		if h.storage.IsHeld(snapshotID) {
			if err := h.storage.DiscardHeld(snapshotID); err != nil {
				http.Error(w, "Failed to delete snapshot: "+err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		http.Error(w, "Snapshot not found", http.StatusNotFound)
		return
	}

	applied := h.writes.writeOrQueue(snapshotID, storage.PendingOp{Op: storage.OpEnd, At: time.Now()})

	if err := h.storage.DeleteSnapshot(snapshotID); err != nil && !errors.Is(err, storage.ErrSnapshotNotFound) {
		http.Error(w, "Failed to delete snapshot: "+err.Error(), http.StatusInternalServerError)
		return
	}
	metrics.SnapshotsDeleted.Inc()

	if applied {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

// PatchSnapshotRequest refreshes a snapshot's keepalive and records any phase
// or services update. The keepalive never depends on the metadata store. A
// snapshot the sweep expired less than the hold period ago is restored.
func (h *Handler) PatchSnapshotRequest(w http.ResponseWriter, r *http.Request, snapshotID string) {
	var payload struct {
		Phase    string   `json:"phase,omitempty"`
		Mode     string   `json:"mode,omitempty"`
		Services []string `json:"services,omitempty"`
	}
	if r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "Invalid payload request", http.StatusBadRequest)
			return
		}
	}

	defer h.locks.lock(snapshotID)()
	now := time.Now()
	var ops []storage.PendingOp
	if err := h.storage.PatchSnapshot(snapshotID); err != nil {
		if !errors.Is(err, storage.ErrSnapshotNotFound) {
			http.Error(w, "Failed to patch snapshot: "+err.Error(), http.StatusInternalServerError)
			return
		}
		// Swept for late keepalives, but still held: put it back in service
		// and reopen it, so the run keeps its metrics without re-registering.
		restored, err := h.storage.Restore(snapshotID)
		if err != nil {
			http.Error(w, "Failed to restore snapshot: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if !restored {
			http.Error(w, "Snapshot not found", http.StatusNotFound)
			return
		}
		metrics.SnapshotsRestored.Inc()
		logger.Info("Restored an expired snapshot on a late keepalive", "id", snapshotID)
		ops = append(ops, storage.PendingOp{Op: storage.OpReopen, At: now})
	}
	metrics.SnapshotsPatched.Inc()

	if payload.Phase != "" && (payload.Mode == "start" || payload.Mode == "end") {
		ops = append(ops, storage.PendingOp{Op: storage.OpPhase, Phase: payload.Phase, Mode: payload.Mode, At: now})
	}
	if len(payload.Services) > 0 {
		ops = append(ops, storage.PendingOp{Op: storage.OpServices, Services: payload.Services, At: now})
	}

	w.Header().Set("Content-Type", "application/json")
	if len(ops) > 0 && !h.writes.writeOrQueue(snapshotID, ops...) {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	w.WriteHeader(http.StatusOK)
}
