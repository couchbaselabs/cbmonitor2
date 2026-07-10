package services

import (
	"sync"
	"time"
)

// ttlCache is a minimal in-memory cache with per-entry expiry. It exists to
// deduplicate repeated live lookups (server queries, Prometheus HTTP
// calls) for the same key within a short window. A single snapshot view
// triggers several independent fetches of the same data in close
// succession, the main snapshot handler, each metric/summary request's
// time-window resolution, metric-name discovery, and the annotation-sync
// path all ask for the same snapshot within moments of each other.
type ttlCache[K comparable, V any] struct {
	mu      sync.Mutex
	ttl     time.Duration
	entries map[K]ttlEntry[V]
}

type ttlEntry[V any] struct {
	value   V
	expires time.Time
}

func newTTLCache[K comparable, V any](ttl time.Duration) *ttlCache[K, V] {
	return &ttlCache[K, V]{
		ttl:     ttl,
		entries: make(map[K]ttlEntry[V]),
	}
}

// get returns the cached value for key, if present and not expired.
func (c *ttlCache[K, V]) get(key K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[key]
	if !ok || time.Now().After(entry.expires) {
		var zero V
		return zero, false
	}
	return entry.value, true
}

// set stores value under key. Opportunistically sweeps expired entries on
// every write so the map doesn't grow unbounded over a long-lived process
// without needing a background goroutine.
func (c *ttlCache[K, V]) set(key K, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	c.entries[key] = ttlEntry[V]{value: value, expires: now.Add(c.ttl)}
	for k, e := range c.entries {
		if now.After(e.expires) {
			delete(c.entries, k)
		}
	}
}

// delete evicts key, if present. Used to force the next get to miss —
// e.g. when a caller explicitly asks for a fresh read.
func (c *ttlCache[K, V]) delete(key K) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, key)
}
