package storage

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func phaseOp(phase, mode string, at time.Time) PendingOp {
	return PendingOp{Op: OpPhase, Phase: phase, Mode: mode, At: at}
}

func TestPendingQueueAppliesInOrderAndEmpties(t *testing.T) {
	q, err := NewPendingQueue(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	if err := q.Append("snap", phaseOp("load", "start", now), phaseOp("load", "end", now.Add(time.Minute))); err != nil {
		t.Fatal(err)
	}
	if !q.Has("snap") || q.Len() != 2 {
		t.Fatalf("Has=%v Len=%d, want 2 queued", q.Has("snap"), q.Len())
	}

	var modes []string
	res := q.Drain("snap", func(op PendingOp) error { modes = append(modes, op.Mode); return nil }, time.Hour, now)
	if res.Applied != 2 || res.Remaining != 0 || res.Err != nil {
		t.Fatalf("drain = %+v", res)
	}
	if len(modes) != 2 || modes[0] != "start" || modes[1] != "end" {
		t.Errorf("applied %v, want start then end", modes)
	}
	if q.Has("snap") {
		t.Error("an empty queue should leave no file behind")
	}
}

// A failure stops the drain, so a later write never overtakes an earlier one.
func TestPendingQueueStopsAtTheFirstFailure(t *testing.T) {
	q, _ := NewPendingQueue(t.TempDir())
	now := time.Now()
	_ = q.Append("snap", phaseOp("load", "start", now), phaseOp("load", "end", now))

	calls := 0
	res := q.Drain("snap", func(PendingOp) error { calls++; return errors.New("unambiguous timeout") }, time.Hour, now)
	if calls != 1 || res.Applied != 0 || res.Remaining != 2 || res.Err == nil {
		t.Errorf("calls=%d drain=%+v; want one attempt and both ops kept", calls, res)
	}
}

func TestPendingQueueKeepsAppendsMadeDuringADrain(t *testing.T) {
	q, _ := NewPendingQueue(t.TempDir())
	now := time.Now()
	_ = q.Append("snap", phaseOp("load", "start", now))

	res := q.Drain("snap", func(PendingOp) error {
		// A PATCH queues behind the op being applied.
		return q.Append("snap", phaseOp("load", "end", now))
	}, time.Hour, now)
	if res.Applied != 1 || res.Remaining != 1 {
		t.Fatalf("drain = %+v, want the new op kept", res)
	}
	var got []string
	q.Drain("snap", func(op PendingOp) error { got = append(got, op.Mode); return nil }, time.Hour, now)
	if len(got) != 1 || got[0] != "end" {
		t.Errorf("second drain applied %v, want [end]", got)
	}
}

func TestPendingQueueDropsWritesPastTheirMaxAge(t *testing.T) {
	q, _ := NewPendingQueue(t.TempDir())
	now := time.Now()
	_ = q.Append("snap", phaseOp("load", "start", now.Add(-48*time.Hour)), phaseOp("load", "end", now))

	var applied []string
	res := q.Drain("snap", func(op PendingOp) error { applied = append(applied, op.Mode); return nil }, 24*time.Hour, now)
	if res.Expired != 1 || res.Applied != 1 || len(applied) != 1 || applied[0] != "end" {
		t.Errorf("drain = %+v applied %v; want the stale op dropped and the fresh one applied", res, applied)
	}
}

func TestPendingQueueSurvivesARestart(t *testing.T) {
	dir := t.TempDir()
	q, _ := NewPendingQueue(dir)
	at := time.Date(2026, 9, 22, 9, 8, 1, 0, time.UTC)
	_ = q.Append("snap", PendingOp{Op: OpEnd, At: at})

	reopened, err := NewPendingQueue(dir)
	if err != nil {
		t.Fatal(err)
	}
	var got PendingOp
	reopened.Drain("snap", func(op PendingOp) error { got = op; return nil }, 1000*time.Hour, at)
	if got.Op != OpEnd || !got.At.Equal(at) {
		t.Errorf("after restart got %+v, want the end-of-life op with its original time", got)
	}

}

// A restarted process numbers new writes after the ones it found on disk, so
// the drainer's bookkeeping never confuses an old op with a new one.
func TestPendingQueueSequenceContinuesAfterARestart(t *testing.T) {
	dir := t.TempDir()
	first, _ := NewPendingQueue(dir)
	at := time.Now()
	_ = first.Append("snap", PendingOp{Op: OpPhase, Mode: "start", At: at}, PendingOp{Op: OpPhase, Mode: "end", At: at})

	restarted, _ := NewPendingQueue(dir)
	_ = restarted.Append("snap", PendingOp{Op: OpEnd, At: at})

	var seqs []uint64
	restarted.Drain("snap", func(op PendingOp) error { seqs = append(seqs, op.Seq); return nil }, time.Hour, at)
	if len(seqs) != 3 || seqs[0] >= seqs[1] || seqs[1] >= seqs[2] {
		t.Errorf("seqs %v, want three strictly increasing", seqs)
	}
}

func TestPendingQueueSkipsATornFinalLine(t *testing.T) {
	dir := t.TempDir()
	q, _ := NewPendingQueue(dir)
	_ = q.Append("snap", PendingOp{Op: OpEnd, At: time.Now()})
	f, _ := os.OpenFile(filepath.Join(dir, pendingDirName, "snap.jsonl"), os.O_APPEND|os.O_WRONLY, 0)
	_, _ = f.WriteString(`{"seq":99,"op":"pha`)
	f.Close()

	res := q.Drain("snap", func(PendingOp) error { return nil }, time.Hour, time.Now())
	if res.Applied != 1 || res.Err != nil {
		t.Errorf("drain = %+v, want the intact op applied", res)
	}
}

// A write queued after a crash left a torn line must not be lost with it.
func TestPendingQueueAppendsCleanlyAfterATornLine(t *testing.T) {
	dir := t.TempDir()
	q, _ := NewPendingQueue(dir)
	_ = q.Append("snap", PendingOp{Op: OpEnd, At: time.Now()})
	f, _ := os.OpenFile(filepath.Join(dir, pendingDirName, "snap.jsonl"), os.O_APPEND|os.O_WRONLY, 0)
	_, _ = f.WriteString(`{"seq":99,"op":"pha`)
	f.Close()

	q, err := NewPendingQueue(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err := q.Append("snap", phaseOp("load", "start", time.Now())); err != nil {
		t.Fatal(err)
	}
	var got []string
	q.Drain("snap", func(op PendingOp) error { got = append(got, op.Op); return nil }, time.Hour, time.Now())
	if len(got) != 2 || got[0] != OpEnd || got[1] != OpPhase {
		t.Errorf("applied %v, want [end phase]", got)
	}
}

// A record longer than a scanner's default line limit still reads back, and
// does not stop the queue opening at startup.
func TestPendingQueueReadsALongRecord(t *testing.T) {
	dir := t.TempDir()
	q, _ := NewPendingQueue(dir)
	services := make([]string, 20000)
	for i := range services {
		services[i] = "service"
	}
	if err := q.Append("snap", PendingOp{Op: OpServices, Services: services, At: time.Now()}); err != nil {
		t.Fatal(err)
	}

	q, err := NewPendingQueue(dir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	var got int
	res := q.Drain("snap", func(op PendingOp) error { got = len(op.Services); return nil }, time.Hour, time.Now())
	if res.Err != nil || got != len(services) {
		t.Errorf("drain = %+v with %d services, want all %d applied", res, got, len(services))
	}
}

func TestPendingDirectoryNeverMatchesTheScrapeGlob(t *testing.T) {
	dir := t.TempDir()
	q, _ := NewPendingQueue(dir)
	_ = q.Append("snap", PendingOp{Op: OpEnd, At: time.Now()})
	matches, _ := filepath.Glob(filepath.Join(dir, "*.yml"))
	if len(matches) != 0 {
		t.Errorf("queued writes are visible to vmagent: %v", matches)
	}
}
