package api

import "sync"

// snapshotLocks hands out one mutex per snapshot ID. Holding it serialises
// everything that changes a snapshot (create, keepalive, restore, phase and
// services writes, end of life), so its metadata writes apply in the order
// they were made. Locks are per ID rather than striped: a write can wait on
// an unresponsive metadata store, and that must not hold up other snapshots.
type snapshotLocks struct {
	mu    sync.Mutex
	locks map[string]*snapshotLock
}

type snapshotLock struct {
	sync.Mutex
	refs int
}

// lock blocks until id is free and returns the function that releases it.
func (l *snapshotLocks) lock(id string) (unlock func()) {
	l.mu.Lock()
	if l.locks == nil {
		l.locks = map[string]*snapshotLock{}
	}
	m := l.locks[id]
	if m == nil {
		m = &snapshotLock{}
		l.locks[id] = m
	}
	m.refs++
	l.mu.Unlock()

	m.Lock()
	return func() {
		m.Unlock()
		l.mu.Lock()
		m.refs--
		if m.refs == 0 {
			delete(l.locks, id)
		}
		l.mu.Unlock()
	}
}
