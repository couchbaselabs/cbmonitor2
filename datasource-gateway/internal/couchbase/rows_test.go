package couchbase

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"
)

// fakeRows yields n identical rows.
type fakeRows struct {
	n, read int
}

func (f *fakeRows) Next() bool { f.read++; return f.read <= f.n }
func (f *fakeRows) Row(v interface{}) error {
	return json.Unmarshal([]byte(`{"labels":{"job":"snap"},"time":"2024-01-02T00:00:00Z","value":1}`), v)
}
func (f *fakeRows) Err() error { return nil }

func TestReadRowsReturnsEveryRowUpToTheLimit(t *testing.T) {
	rows, err := readRows(&fakeRows{n: 5}, 5)
	if err != nil || len(rows) != 5 {
		t.Errorf("got %d rows, err %v; want all 5", len(rows), err)
	}
}

// A query past the limit fails instead of being read whole, so its memory
// stays bounded.
func TestReadRowsStopsPastTheLimit(t *testing.T) {
	src := &fakeRows{n: 1000}
	rows, err := readRows(src, 10)
	if !errors.Is(err, ErrTooManyRows) || rows != nil {
		t.Fatalf("rows %d, err %v; want ErrTooManyRows", len(rows), err)
	}
	if src.read > 11 {
		t.Errorf("read %d rows before failing, want to stop at the limit", src.read)
	}
}

// The row cap is the gateway's limit, not a Couchbase Server failure.
func TestQueryResultLeavesTheRowCapOutOfBackendErrors(t *testing.T) {
	for _, c := range []struct {
		err  error
		want string
	}{
		{nil, "ok"},
		{fmt.Errorf("%w: more than 10", ErrTooManyRows), "ok"},
		{errors.New("query error: timeout"), "error"},
	} {
		if got := queryResult(c.err); got != c.want {
			t.Errorf("queryResult(%v) = %q, want %q", c.err, got, c.want)
		}
	}
}
