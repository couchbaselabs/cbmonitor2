package api

import (
	"fmt"
	"sync"
	"time"

	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/storage"
)

const (
	// drainInterval is how often queued metadata writes are retried.
	drainInterval = 5 * time.Second
	// pendingMaxAge is how long a queued write is retried before it is
	// dropped; well past any metadata-store outage worth riding out.
	pendingMaxAge = 24 * time.Hour
)

// metadataWrites applies phase, services, end-of-life and reopen writes to the
// metadata store, queueing any it cannot apply so the request still succeeds.
// On 2026-09-22 a metadata-store timeout turned every PATCH into a 500 for
// minutes and the client killed two runs; a keepalive or phase change must
// never depend on the store being up.
type metadataWrites struct {
	storage storage.MetadataStorage
	pending *storage.PendingQueue

	stopOnce sync.Once
	done     chan struct{}
	stopped  chan struct{}
}

func newMetadataWrites(md storage.MetadataStorage, pending *storage.PendingQueue) *metadataWrites {
	w := &metadataWrites{
		storage: md,
		pending: pending,
		done:    make(chan struct{}),
		stopped: make(chan struct{}),
	}
	go w.loop()
	return w
}

// writeOrQueue applies ops in order and reports whether all were applied now.
// Once one fails, it and every later op are queued, and while id has anything
// queued new ops queue behind it, so a phase end never lands before its start.
func (w *metadataWrites) writeOrQueue(id string, ops ...storage.PendingOp) bool {
	if w.pending.Has(id) {
		w.enqueue(id, ops)
		return false
	}
	for i, op := range ops {
		if err := w.apply(id, op); err != nil {
			logger.Warn("Queueing metadata write", "snapshot", id, "op", op.Op, "error", err)
			w.enqueue(id, ops[i:])
			return false
		}
	}
	return true
}

func (w *metadataWrites) enqueue(id string, ops []storage.PendingOp) {
	if err := w.pending.Append(id, ops...); err != nil {
		logger.Error("Failed to queue metadata write; it is lost", "snapshot", id, "ops", len(ops), "error", err)
	}
}

func (w *metadataWrites) apply(id string, op storage.PendingOp) error {
	switch op.Op {
	case storage.OpPhase:
		return w.storage.UpdatePhase(id, op.Phase, op.Mode, op.At)
	case storage.OpServices:
		return w.storage.UpdateServices(id, op.Services)
	case storage.OpEnd:
		return w.storage.EoLSnapshot(id, op.At)
	case storage.OpReopen:
		return w.storage.Update(id, func(md *models.SnapshotMetadata) error {
			md.TsEnd = "now"
			return nil
		})
	default:
		// Unknown ops cannot become applicable; applying nothing drops them.
		logger.Warn("Dropping unknown queued metadata write", "snapshot", id, "op", op.Op)
		return nil
	}
}

// drain retries every snapshot's queued writes once.
func (w *metadataWrites) drain(now time.Time) {
	for _, id := range w.pending.IDs() {
		res := w.pending.Drain(id, func(op storage.PendingOp) error { return w.apply(id, op) }, pendingMaxAge, now)
		if res.Applied > 0 {
			logger.Info("Applied queued metadata writes", "snapshot", id, "applied", res.Applied, "remaining", res.Remaining)
		}
		if res.Expired > 0 {
			logger.Error("Dropped queued metadata writes past their retry window", "snapshot", id,
				"dropped", res.Expired, "max_age", pendingMaxAge.String())
		}
	}
}

func (w *metadataWrites) loop() {
	defer close(w.stopped)
	ticker := time.NewTicker(drainInterval)
	defer ticker.Stop()
	for {
		select {
		case <-w.done:
			return
		case now := <-ticker.C:
			w.drain(now)
		}
	}
}

// stop ends background retries; queued writes stay on disk for the next start.
func (w *metadataWrites) stop() {
	w.stopOnce.Do(func() { close(w.done) })
	<-w.stopped
}

func (w *metadataWrites) String() string {
	return fmt.Sprintf("metadataWrites{pending: %d}", w.pending.Len())
}
