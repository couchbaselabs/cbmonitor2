package handlers

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/couchbase/cbmonitor/pkg/promql"
)

// fakeQuerier is a couchbaseQuerier stub: each invocation pops the next
// scripted result from results, with errs supplying the matching errors.
// Used to exercise the PromQL handler's per-sub-query failure tracking
// without standing up a real gocb cluster.
type fakeQuerier struct {
	calls   int
	results [][]map[string]interface{}
	errs    []error
}

func (f *fakeQuerier) ExecuteQuery(ctx context.Context, query string) ([]map[string]interface{}, error) {
	i := f.calls
	f.calls++
	var rows []map[string]interface{}
	var err error
	if i < len(f.results) {
		rows = f.results[i]
	}
	if i < len(f.errs) {
		err = f.errs[i]
	}
	return rows, err
}

// runExecuteQuery exercises the handler's executeQuery with a fake
// querier. Returns the result + error verbatim so callers can assert on either path.
func runExecuteQuery(t *testing.T, q couchbaseQuerier, promQL string) (*promql.PrometheusResult, error) {
	t.Helper()
	h := &PromQLHandler{couchbaseService: q}
	// PromQL parsing requires a real metric name + timestamp; use a
	// simple instant query.
	queryCtx, err := promql.ParseQueryContext(promQL, "1700000000", "", "", "", "")
	if err != nil {
		t.Fatalf("ParseQueryContext: %v", err)
	}
	queryCtx.Context = context.Background()
	return h.executeQuery(queryCtx)
}

func TestPromQLExecute_AllSubQueriesFailedReturnsError(t *testing.T) {
	// Force the underlying querier to fail every call. The handler must
	// not return a misleading "success with empty data" — it should
	// surface the failure so panels show an error instead of silently
	// rendering "no data".
	q := &fakeQuerier{
		errs: []error{
			errors.New("boom1"),
			errors.New("boom2"),
			errors.New("boom3"),
		},
	}
	_, err := runExecuteQuery(t, q, `up`)
	if err == nil {
		t.Fatalf("expected error when all sub-queries fail; got nil")
	}
	if !strings.Contains(err.Error(), "sub-queries failed") {
		t.Errorf("error should mention sub-query failures, got: %v", err)
	}
}

func TestPromQLExecute_NilServiceReturnsError(t *testing.T) {
	// A nil-couchbase-service handler (init failed but routes are still
	// registered because the feature toggle is on) must return a clear
	// error rather than panic with a nil-pointer dereference.
	h := &PromQLHandler{couchbaseService: nil}
	queryCtx, err := promql.ParseQueryContext(`up`, "1700000000", "", "", "", "")
	if err != nil {
		t.Fatalf("ParseQueryContext: %v", err)
	}
	queryCtx.Context = context.Background()
	_, err = h.executeQuery(queryCtx)
	if err == nil {
		t.Fatalf("expected error when couchbaseService is nil")
	}
	if !strings.Contains(err.Error(), "unavailable") {
		t.Errorf("error should explain the service is unavailable, got: %v", err)
	}
}
