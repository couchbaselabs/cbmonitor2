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
	"fmt"
	"net/http"
	"strings"

	"golang.org/x/sync/errgroup"

	"github.com/couchbase/datasource-gateway/internal/cbeval"
	"github.com/couchbase/datasource-gateway/internal/logger"
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
	// Warnings carries per-snapshot problems that didn't fail the whole comparison; Grafana surfaces these on the panel.
	Warnings []string `json:"warnings,omitempty"`
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
// matrix response, carrying warnings so a snapshot missing from the comparison
// is visible on the panel instead of silently absent. Failed or windowless legs
// are nil and skipped; nil is returned only when no leg succeeded.
func mergeEnvelopes(legs []*promEnvelope, warnings []string) *promEnvelope {
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
		merged.Warnings = append(merged.Warnings, leg.Warnings...)
	}
	if !any {
		return nil
	}
	merged.Warnings = append(merged.Warnings, warnings...)
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
	legErrs := make([]string, len(ids))
	g, ctx := errgroup.WithContext(r.Context())
	g.SetLimit(maxOverlapSnapshots)
	for i, id := range ids {
		g.Go(func() (err error) {
			// A panic in one leg must not take the process down with it: these goroutines
			// are outside net/http's per-connection recovery, and errgroup does not recover either.
			defer func() {
				if rec := recover(); rec != nil {
					logger.Error("Overlap leg panicked", "snapshot", id, "panic", rec)
					legErrs[i] = fmt.Sprintf("snapshot %s: internal error evaluating query", id)
				}
			}()
			env, route, legErr := h.overlapLeg(ctx, query, id, step)
			if env == nil {
				legErrs[i] = fmt.Sprintf("snapshot %s: %s", id, legErr)
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

	warnings := make([]string, 0, len(legErrs))
	for _, e := range legErrs {
		if e != "" {
			warnings = append(warnings, e)
		}
	}
	merged := mergeEnvelopes(legs, warnings)
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

// overlapLeg runs the query for one snapshot over its stored window via its own store.
// A leg that can't produce data returns a nil envelope plus the reason, so it drops out of the comparison rather than failing it.
// but the reason reaches the caller as a warning instead of vanishing.
func (h *Handler) overlapLeg(ctx context.Context, query, id, step string) (*promEnvelope, router.Route, string) {
	route := h.router.Resolve(ctx, id)
	if !route.HasWindow {
		return nil, route, "no time window in snapshot metadata"
	}
	q := replaceJobMatcher(query, id)

	if route.Store == router.StoreCouchbase {
		res, err := h.evaluator.RangeQuery(ctx, q, route.Start, route.End, parseStepParam(step))
		if err != nil {
			return nil, route, "query failed: " + err.Error()
		}
		return fromCBResult(res), route, ""
	}

	body, status, err := h.prometheus.QueryRange(ctx, q, route.Start, route.End, step)
	if err != nil {
		return nil, route, "upstream request failed: " + err.Error()
	}
	if status != http.StatusOK {
		return nil, route, fmt.Sprintf("upstream returned HTTP %d", status)
	}
	var env promEnvelope
	if err := json.Unmarshal(body, &env); err != nil {
		return nil, route, "could not decode upstream response"
	}
	if env.Status != "success" {
		return nil, route, "upstream reported: " + env.Error
	}
	return &env, route, ""
}
