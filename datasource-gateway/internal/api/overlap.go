// Overlap (multi-snapshot comparison) evaluation. A query whose job matcher
// targets several snapshots (job=~"a|b") fans out into one query per
// snapshot: the matcher is rewritten to that snapshot alone, the window is
// replaced by the snapshot's stored [ts_start, ts_end], and the query runs
// through the snapshot's own store (Mimir passthrough or the Couchbase
// evaluator) with the request's shared step. Sample timestamps are then
// shifted down by ts_start so every snapshot starts at t=0. The axis the
// overlap panels pin, and the per-snapshot matrices are concatenated. Series
// stay distinguishable by their original job label.
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"golang.org/x/sync/errgroup"

	"github.com/couchbase/datasource-gateway/internal/cbeval"
	"github.com/couchbase/datasource-gateway/internal/router"
)

// maxOverlapSnapshots caps the fan-out; the compare UI allows at most 6 snapshots per comparison.
const maxOverlapSnapshots = 6

// promEnvelope is the Prometheus query-response envelope, shared by the
// upstream JSON and the Couchbase evaluator result.
type promEnvelope struct {
	Status    string   `json:"status"`
	Data      promData `json:"data"`
	ErrorType string   `json:"errorType,omitempty"`
	Error     string   `json:"error,omitempty"`
}

type promData struct {
	ResultType string       `json:"resultType"`
	Result     []promSeries `json:"result"`
}

type promSeries struct {
	Metric map[string]string `json:"metric"`
	Values [][]interface{}   `json:"values,omitempty"`
	Value  []interface{}     `json:"value,omitempty"`
}

// splitJobs returns the snapshot IDs from the query's job matcher. Regex
// escapes the frontend may add to matcher alternations are stripped, so the
// returned IDs are plain snapshot IDs. IDs are deduped preserving order.
func splitJobs(query string) []string {
	m := jobSelectorRe.FindStringSubmatch(query)
	if len(m) < 2 {
		return nil
	}
	seen := map[string]bool{}
	var ids []string
	for _, part := range strings.Split(m[1], "|") {
		id := strings.ReplaceAll(strings.TrimSpace(part), `\`, "")
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	return ids
}

// replaceJobMatcher rewrites every job matcher in the query to exactly one
// snapshot: job=~"a|b" -> job="id".
func replaceJobMatcher(query, id string) string {
	return jobSelectorRe.ReplaceAllLiteralString(query, `job="`+id+`"`)
}

// shiftEnvelope subtracts offsetSec from every sample timestamp so the series
// starts at t=0. Timestamps decode as float64 seconds and are written back as
// integer seconds (points sit on step multiples from the window start).
func shiftEnvelope(env *promEnvelope, offsetSec int64) {
	for si := range env.Data.Result {
		for _, v := range env.Data.Result[si].Values {
			if len(v) < 2 {
				continue
			}
			if ts, ok := v[0].(float64); ok {
				v[0] = int64(ts) - offsetSec
			}
		}
	}
}

// mergeEnvelopes concatenates the successful per-snapshot results into one
// matrix response. Failed or windowless legs are nil and skipped; nil is
// returned only when no leg succeeded.
func mergeEnvelopes(legs []*promEnvelope) *promEnvelope {
	merged := &promEnvelope{Status: "success"}
	merged.Data.ResultType = "matrix"
	merged.Data.Result = []promSeries{}
	any := false
	for _, leg := range legs {
		if leg == nil {
			continue
		}
		any = true
		if leg.Data.ResultType != "" {
			merged.Data.ResultType = leg.Data.ResultType
		}
		merged.Data.Result = append(merged.Data.Result, leg.Data.Result...)
	}
	if !any {
		return nil
	}
	return merged
}

// fromCBResult adapts the Couchbase evaluator's result to the shared envelope.
func fromCBResult(res *cbeval.Result) *promEnvelope {
	env := &promEnvelope{Status: res.Status}
	env.Data.ResultType = res.Data.ResultType
	env.Data.Result = make([]promSeries, 0, len(res.Data.Result))
	for _, s := range res.Data.Result {
		env.Data.Result = append(env.Data.Result, promSeries{Metric: s.Metric, Values: s.Values})
	}
	return env
}

// serveOverlap fans a multi-snapshot query out per snapshot and writes the
// merged result. shift controls the t=0 alignment: range queries shift so the
// overlap panels' 0-based axis lines up; instant-style discovery queries
// (whose consumers only read labels) keep absolute time.
func (h *Handler) serveOverlap(w http.ResponseWriter, r *http.Request, ids []string, shift bool) {
	if len(ids) > maxOverlapSnapshots {
		ids = ids[:maxOverlapSnapshots]
	}
	query := r.Form.Get("query")
	step := r.Form.Get("step")
	if step == "" {
		step = "15"
	}

	legs := make([]*promEnvelope, len(ids))
	g, ctx := errgroup.WithContext(r.Context())
	g.SetLimit(maxOverlapSnapshots)
	for i, id := range ids {
		g.Go(func() error {
			env, route := h.overlapLeg(ctx, query, id, step)
			if env == nil {
				return nil
			}
			if shift {
				shiftEnvelope(env, route.Start.Unix())
			}
			legs[i] = env
			return nil
		})
	}
	_ = g.Wait()

	merged := mergeEnvelopes(legs)
	if merged == nil {
		// No leg produced a result, typically no snapshot metadata is
		// available (e.g. Couchbase disabled). Degrade to a plain passthrough
		// rather than failing, matching the gateway's other fallbacks.
		forwardForm(r)
		h.prometheus.ReverseProxy().ServeHTTP(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(merged)
}

// overlapLeg runs the query for one snapshot over its stored window via its
// own store. Returns a nil envelope when the snapshot has no window or the
// query fails, a failed leg drops out of the comparison rather than failing it.
func (h *Handler) overlapLeg(ctx context.Context, query, id, step string) (*promEnvelope, router.Route) {
	route := h.router.Resolve(ctx, id)
	if !route.HasWindow {
		return nil, route
	}
	q := replaceJobMatcher(query, id)

	if route.Store == router.StoreCouchbase {
		res, err := h.evaluator.RangeQuery(ctx, q, route.Start, route.End, parseStepParam(step))
		if err != nil {
			return nil, route
		}
		return fromCBResult(res), route
	}

	body, status, err := h.prometheus.QueryRange(ctx, q, route.Start, route.End, step)
	if err != nil || status != http.StatusOK {
		return nil, route
	}
	var env promEnvelope
	if err := json.Unmarshal(body, &env); err != nil || env.Status != "success" {
		return nil, route
	}
	return &env, route
}
