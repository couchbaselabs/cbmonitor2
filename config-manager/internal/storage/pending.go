package storage

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// PendingOp is a metadata write that could not be applied when the client
// made it: the store was unreachable, or the document did not exist yet. At is
// when the client reported the event, so applying it later records the right
// time.
type PendingOp struct {
	Seq      uint64    `json:"seq"`
	Op       string    `json:"op"` // OpPhase, OpServices, OpEnd or OpReopen
	Phase    string    `json:"phase,omitempty"`
	Mode     string    `json:"mode,omitempty"`
	Services []string  `json:"services,omitempty"`
	At       time.Time `json:"at"`
}

const (
	OpPhase    = "phase"
	OpServices = "services"
	OpEnd      = "end"
	// OpReopen marks a swept snapshot as running again when its client
	// re-registers it.
	OpReopen = "reopen"
)

// PendingQueue keeps queued metadata writes on disk, one file per snapshot, so
// they survive a restart. Writes for one snapshot apply in the order they were
// made: once a snapshot has anything queued, later writes queue behind it.
//
// A single drainer removes ops from the head of a snapshot's queue; appends
// can run concurrently with it, because the drainer applies ops without
// holding the lock and then removes exactly the ones it applied.
type PendingQueue struct {
	dir string

	mu      sync.Mutex
	nextSeq uint64
}

// pendingDirName lives inside the snapshot directory but never matches the
// "*.yml" glob vmagent and the manager loop read.
const pendingDirName = ".pending"

// NewPendingQueue opens the queue under snapshotDir, creating it if needed.
func NewPendingQueue(snapshotDir string) (*PendingQueue, error) {
	dir := filepath.Join(snapshotDir, pendingDirName)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("create pending-write directory: %w", err)
	}
	q := &PendingQueue{dir: dir}
	// Resume sequence numbers after whatever a previous run left behind.
	for _, id := range q.IDs() {
		ops, err := q.read(id)
		if err != nil {
			return nil, err
		}
		for _, op := range ops {
			if op.Seq >= q.nextSeq {
				q.nextSeq = op.Seq + 1
			}
		}
	}
	return q, nil
}

func (q *PendingQueue) path(id string) string {
	return filepath.Join(q.dir, id+".jsonl")
}

// Has reports whether id has queued writes.
func (q *PendingQueue) Has(id string) bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	_, err := os.Stat(q.path(id))
	return err == nil
}

// Append queues ops for id behind anything already queued.
func (q *PendingQueue) Append(id string, ops ...PendingOp) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	var buf bytes.Buffer
	for _, op := range ops {
		op.Seq = q.nextSeq
		q.nextSeq++
		line, err := json.Marshal(op)
		if err != nil {
			return err
		}
		buf.Write(line)
		buf.WriteByte('\n')
	}
	f, err := os.OpenFile(q.path(id), os.O_CREATE|os.O_APPEND|os.O_RDWR, 0o600)
	if err != nil {
		return err
	}
	// A crash mid-append leaves a torn last line. Start on a fresh line, or
	// the first new record would join the fragment and be skipped with it.
	torn, err := endsMidLine(f)
	if err != nil {
		f.Close()
		return err
	}
	out := buf.Bytes()
	if torn {
		out = append([]byte{'\n'}, out...)
	}
	if _, err := f.Write(out); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// endsMidLine reports whether f is non-empty and its last byte is not a
// newline.
func endsMidLine(f *os.File) (bool, error) {
	info, err := f.Stat()
	if err != nil || info.Size() == 0 {
		return false, err
	}
	last := make([]byte, 1)
	if _, err := f.ReadAt(last, info.Size()-1); err != nil {
		return false, err
	}
	return last[0] != '\n', nil
}

// IDs lists the snapshots with queued writes, sorted.
func (q *PendingQueue) IDs() []string {
	entries, err := os.ReadDir(q.dir)
	if err != nil {
		return nil
	}
	var ids []string
	for _, e := range entries {
		if name := e.Name(); strings.HasSuffix(name, ".jsonl") {
			ids = append(ids, strings.TrimSuffix(name, ".jsonl"))
		}
	}
	sort.Strings(ids)
	return ids
}

// Len reports the number of queued writes across all snapshots.
func (q *PendingQueue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	n := 0
	for _, id := range q.IDs() {
		ops, _ := q.read(id)
		n += len(ops)
	}
	return n
}

// read returns id's queued ops in order. The caller holds q.mu.
func (q *PendingQueue) read(id string) ([]PendingOp, error) {
	data, err := os.ReadFile(q.path(id))
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var ops []PendingOp
	// Split rather than scan: a scanner caps line length, and one long record
	// would make every read of this queue fail, including the one at startup.
	for _, line := range bytes.Split(data, []byte{'\n'}) {
		line = bytes.TrimSpace(line)
		if len(line) == 0 {
			continue
		}
		var op PendingOp
		// A torn final line from a crash mid-append is skipped; everything
		// before it was fsynced.
		if json.Unmarshal(line, &op) != nil {
			continue
		}
		ops = append(ops, op)
	}
	sort.SliceStable(ops, func(i, j int) bool { return ops[i].Seq < ops[j].Seq })
	return ops, nil
}

// DrainResult reports what one Drain call did.
type DrainResult struct {
	Applied int
	Expired int
	// Remaining is how many ops are still queued; Err is why the first of
	// them could not be applied, if one was attempted.
	Remaining int
	Err       error
}

// Drain applies id's queued ops in order, stopping at the first failure so
// later writes never overtake earlier ones. Ops older than maxAge are dropped
// unapplied: a write that has failed for that long is not coming back.
func (q *PendingQueue) Drain(id string, apply func(PendingOp) error, maxAge time.Duration, now time.Time) DrainResult {
	q.mu.Lock()
	ops, err := q.read(id)
	q.mu.Unlock()
	if err != nil {
		return DrainResult{Err: err}
	}

	var res DrainResult
	done := map[uint64]bool{}
	for _, op := range ops {
		if now.Sub(op.At) > maxAge {
			done[op.Seq] = true
			res.Expired++
			continue
		}
		if err := apply(op); err != nil {
			res.Err = err
			break
		}
		done[op.Seq] = true
		res.Applied++
	}

	q.mu.Lock()
	defer q.mu.Unlock()
	// Re-read: appends may have landed while ops were being applied.
	current, err := q.read(id)
	if err != nil {
		res.Err = err
		return res
	}
	var left []PendingOp
	for _, op := range current {
		if !done[op.Seq] {
			left = append(left, op)
		}
	}
	res.Remaining = len(left)
	if len(left) == 0 {
		if err := os.Remove(q.path(id)); err != nil && !os.IsNotExist(err) {
			res.Err = err
		}
		return res
	}
	var buf bytes.Buffer
	for _, op := range left {
		line, _ := json.Marshal(op)
		buf.Write(line)
		buf.WriteByte('\n')
	}
	if err := writeFileAtomic(q.dir, q.path(id), buf.Bytes(), 0o600); err != nil {
		res.Err = err
	}
	return res
}

// Discard drops everything queued for id.
func (q *PendingQueue) Discard(id string) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	err := os.Remove(q.path(id))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
