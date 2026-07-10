package services

import (
	"testing"
	"time"
)

func TestTTLCache_getMissThenSetThenHit(t *testing.T) {
	c := newTTLCache[string, int](time.Minute)

	if _, ok := c.get("a"); ok {
		t.Fatal("expected miss on empty cache")
	}

	c.set("a", 42)
	got, ok := c.get("a")
	if !ok || got != 42 {
		t.Fatalf("get after set = (%v, %v), want (42, true)", got, ok)
	}
}

func TestTTLCache_expiresAfterTTL(t *testing.T) {
	c := newTTLCache[string, int](10 * time.Millisecond)

	c.set("a", 1)
	if _, ok := c.get("a"); !ok {
		t.Fatal("expected hit immediately after set")
	}

	time.Sleep(20 * time.Millisecond)
	if _, ok := c.get("a"); ok {
		t.Fatal("expected miss after TTL elapsed")
	}
}

func TestTTLCache_setSweepsExpiredEntries(t *testing.T) {
	c := newTTLCache[string, int](10 * time.Millisecond)

	c.set("stale", 1)
	time.Sleep(20 * time.Millisecond)
	c.set("fresh", 2)

	c.mu.Lock()
	_, staleStillPresent := c.entries["stale"]
	entryCount := len(c.entries)
	c.mu.Unlock()

	if staleStillPresent {
		t.Error("expected stale entry to be swept on next set")
	}
	if entryCount != 1 {
		t.Errorf("entries = %d, want 1 (only fresh)", entryCount)
	}
}
