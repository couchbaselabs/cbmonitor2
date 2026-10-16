// Package manager sweeps snapshots whose keepalives have stopped.
package manager

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/metrics"
	"github.com/couchbase/config-manager/internal/storage"
)

// DefaultHoldPeriod is how long an expired snapshot's scrape file is kept so
// a late keepalive can restore it. Long enough to cover a client stalled in a
// long phase, short enough that held credentials do not linger.
const DefaultHoldPeriod = 6 * time.Hour

// Sweeper takes stale snapshots out of service. A snapshot is stale when its
// scrape file has not been refreshed by a keepalive within StaleThreshold. Its
// file moves to the holding directory, which stops scraping, and stays there
// for HoldPeriod so a late keepalive can restore it.
//
// The sweep is the only thing that stops scraping for a client that died, so
// it must keep running: a failed pass is logged and retried on the next tick,
// never fatal.
type Sweeper struct {
	Files *storage.FileStorage
	// End records a snapshot's end of life, queueing the write if the metadata
	// store cannot take it. It reports whether the write was applied now.
	End func(id string, at time.Time) bool
	// Lock, when set, serialises the sweep with the API's changes to one
	// snapshot. Without it, a keepalive landing between expiring a snapshot
	// and recording its end of life would restore and reopen it, and the end
	// of life would then close a snapshot that is being scraped again.
	Lock           func(id string) (unlock func())
	Interval       time.Duration
	StaleThreshold time.Duration
	HoldPeriod     time.Duration

	now         func() time.Time
	lastSuccess atomic.Int64 // unix nanoseconds
}

// LastSuccess reports when a sweep last completed, or the zero time before
// the first one.
func (s *Sweeper) LastSuccess() time.Time {
	if ns := s.lastSuccess.Load(); ns != 0 {
		return time.Unix(0, ns)
	}
	return time.Time{}
}

func (s *Sweeper) clock() time.Time {
	if s.now != nil {
		return s.now()
	}
	return time.Now()
}

// Sweep runs one pass: expire stale snapshots, purge held files past their
// hold period, and publish the active count. A snapshot that cannot be
// expired is still scraped, so the pass carries on with the rest but fails,
// and the heartbeat does not advance. It stops early when ctx ends:
// recording each end of life can wait on the metadata store, and shutdown
// must not.
func (s *Sweeper) Sweep(ctx context.Context) error {
	now := s.clock()
	active, err := s.Files.ListActive()
	if err != nil {
		return fmt.Errorf("list snapshots: %w", err)
	}

	remaining := 0
	var failed []error
	for _, snap := range active {
		if err := ctx.Err(); err != nil {
			return err
		}
		if now.Sub(snap.ModTime) <= s.StaleThreshold {
			remaining++
			continue
		}
		stillActive, err := s.expire(snap.ID, now)
		if err != nil {
			failed = append(failed, fmt.Errorf("expire %s: %w", snap.ID, err))
		}
		if stillActive {
			remaining++
		}
	}
	metrics.SetActiveSnapshots(remaining)

	if purged, err := s.Files.PurgeHeld(s.HoldPeriod, now); err != nil {
		logger.Warn("Failed to purge held snapshots", "error", err)
	} else if purged > 0 {
		logger.Info("Purged held snapshots past their hold period", "count", purged, "hold_period", s.HoldPeriod.String())
	}
	return errors.Join(failed...)
}

// expire takes one stale snapshot out of service and records its end of life,
// holding the snapshot's lock throughout. It reports whether the snapshot is
// still active: a keepalive may have arrived since the listing, or expiring
// it failed. An end of life the metadata store cannot take now is queued,
// which is not a failure.
func (s *Sweeper) expire(id string, now time.Time) (active bool, err error) {
	if s.Lock != nil {
		defer s.Lock(id)()
	}
	last, err := s.Files.LastKeepalive(id)
	switch {
	case errors.Is(err, storage.ErrSnapshotNotFound):
		// Deleted since the listing.
		return false, nil
	case err != nil:
		return true, err
	case now.Sub(last) <= s.StaleThreshold:
		return true, nil
	}
	if err := s.Files.Expire(id, now); err != nil {
		return true, err
	}
	metrics.SnapshotsExpired.Inc()
	recorded := s.End(id, now)
	logger.Info("Expired stale snapshot", "id", id,
		"idle_minutes", int(now.Sub(last).Minutes()), "end_of_life_recorded", recorded)
	return false, nil
}

// Run sweeps every Interval until ctx ends. It sweeps once at start so a
// restart does not delay cleanup by a whole interval.
func (s *Sweeper) Run(ctx context.Context) {
	for {
		if err := s.Sweep(ctx); err != nil {
			if ctx.Err() != nil {
				return
			}
			metrics.SweepFailures.Inc()
			logger.Error("Snapshot sweep failed; retrying next interval", "error", err)
		} else {
			s.lastSuccess.Store(time.Now().UnixNano())
			metrics.SweepLastSuccess.SetToCurrentTime()
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(s.Interval):
		}
	}
}

// ValidateTimings rejects sweep settings outside their supported range. The
// sweep used to substitute its minimum for an out-of-range interval with only a
// warning, so a configured 2m silently ran as 5m.
func ValidateTimings(interval, minInterval, staleThreshold time.Duration) error {
	const maxInterval, minStale, maxStale = 30 * time.Minute, 5 * time.Minute, 30 * time.Minute
	if interval <= 0 {
		// A zero interval with a zero minimum would sweep in a busy loop.
		return fmt.Errorf("manager.interval %v must be positive", interval)
	}
	if interval < minInterval || interval > maxInterval {
		return fmt.Errorf("manager.interval %v is outside %v to %v (manager.min_interval to 30m)", interval, minInterval, maxInterval)
	}
	if staleThreshold < minStale || staleThreshold > maxStale {
		return fmt.Errorf("manager.stale_threshold %v is outside %v to %v", staleThreshold, minStale, maxStale)
	}
	return nil
}
