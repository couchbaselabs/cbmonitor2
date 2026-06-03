package router

import (
	"context"
	"strings"
	"time"

	lru "github.com/hashicorp/golang-lru/v2/expirable"
	"golang.org/x/sync/singleflight"

	"github.com/couchbase/datasource-gateway/internal/couchbase"
)

// Store identifies which backend holds a snapshot's metrics.
type Store string

const (
	StoreCouchbase  Store = "couchbase"
	StorePrometheus Store = "prometheus"
)

// Route is the cached routing decision and time window for a snapshot.
type Route struct {
	Snapshot  string
	Store     Store
	Start     time.Time
	End       time.Time
	HasWindow bool
}

// metadataSource is the slice of the Couchbase client the router needs.
type metadataSource interface {
	Enabled() bool
	GetSnapshotMetadata(ctx context.Context, snapshotID string) (*couchbase.Metadata, error)
}

const (
	cacheSize = 4096
	cacheTTL  = 6 * time.Hour
)

// Router decides, per snapshot, whether its metrics come from Couchbase or the
// upstream Prometheus, and resolves the snapshot's absolute time window. A
// snapshot's metadata is fetched at most once (snapshots are immutable) and
// cached; concurrent resolves for the same snapshot share a single fetch.
type Router struct {
	cb    metadataSource
	cache *lru.LRU[string, Route]
	group singleflight.Group
}

// New constructs a Router over the given metadata source.
func New(cb metadataSource) *Router {
	return &Router{
		cb:    cb,
		cache: lru.NewLRU[string, Route](cacheSize, nil, cacheTTL),
	}
}

// Resolve returns the routing decision for a snapshot. Queries with no snapshot
// (empty id) or when Couchbase is disabled fall back to Prometheus passthrough.
// A failed metadata lookup also falls back to Prometheus and is not cached, so
// a transient error doesn't pin a wrong decision for the cache TTL.
func (r *Router) Resolve(ctx context.Context, snapshotID string) Route {
	if snapshotID == "" || r.cb == nil || !r.cb.Enabled() {
		return Route{Snapshot: snapshotID, Store: StorePrometheus}
	}
	if rt, ok := r.cache.Get(snapshotID); ok {
		return rt
	}
	v, _, _ := r.group.Do(snapshotID, func() (any, error) {
		if rt, ok := r.cache.Get(snapshotID); ok {
			return rt, nil
		}
		rt, cacheable := r.resolveUncached(ctx, snapshotID)
		if cacheable {
			r.cache.Add(snapshotID, rt)
		}
		return rt, nil
	})
	return v.(Route)
}

func (r *Router) resolveUncached(ctx context.Context, snapshotID string) (Route, bool) {
	md, err := r.cb.GetSnapshotMetadata(ctx, snapshotID)
	if err != nil {
		// No metadata doc (or transient error): fall back to passthrough and
		// don't cache, so the next request retries the lookup.
		return Route{Snapshot: snapshotID, Store: StorePrometheus}, false
	}
	rt := Route{Snapshot: snapshotID, Store: storeFromMetadata(md)}
	if start, end, ok := parseWindow(md); ok {
		rt.Start, rt.End, rt.HasWindow = start, end, true
	}
	return rt, true
}

// storeFromMetadata honours an explicit `store` field; absent that, a present
// metadata document implies the metrics live in Couchbase too.
func storeFromMetadata(md *couchbase.Metadata) Store {
	switch Store(strings.ToLower(strings.TrimSpace(md.Store))) {
	case StorePrometheus:
		return StorePrometheus
	case StoreCouchbase:
		return StoreCouchbase
	default:
		return StoreCouchbase
	}
}

// parseWindow parses the snapshot's [start,end] from its metadata timestamps,
// tolerating RFC3339, a zone-less layout, and the space-separated variant.
func parseWindow(md *couchbase.Metadata) (time.Time, time.Time, bool) {
	start, ok1 := parseTime(md.TSStart)
	end, ok2 := parseTime(md.TSEnd)
	if !ok1 || !ok2 {
		return time.Time{}, time.Time{}, false
	}
	return start, end, true
}

func parseTime(s string) (time.Time, bool) {
	layouts := []string{time.RFC3339, time.RFC3339Nano, "2006-01-02T15:04:05", "2006-01-02 15:04:05"}
	for _, l := range layouts {
		if t, err := time.Parse(l, s); err == nil {
			return t, true
		}
	}
	if t, err := time.Parse(time.RFC3339, strings.Replace(s, " ", "T", 1)); err == nil {
		return t, true
	}
	return time.Time{}, false
}
