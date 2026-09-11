// Overlap (multi-snapshot comparison) evaluation. A query whose job matcher
// targets several snapshots (job=~"a|b") fans out into one query per
// snapshot: the matcher is rewritten to that snapshot alone and the query runs
// through the snapshot's own store (Mimir passthrough or the Couchbase
// evaluator). A range query evaluates over the snapshot's stored
// [ts_start, ts_end] with the request's shared step, and sample timestamps are
// shifted down by ts_start so every snapshot starts at t=0, the axis the
// overlap panels pin. An instant query evaluates once at the snapshot's
// ts_end and keeps absolute time. The per-snapshot results are concatenated;
// series stay distinguishable by their original job label.
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

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
		env.Data.Result = append(env.Data.Result, promSeries{Metric: s.Metric, Values: s.Values, Value: s.Value})
	}
	return env
}

// serveOverlap fans a multi-snapshot query out per snapshot and writes the merged result.
// A range query (instant=false) evaluates each leg over its snapshot's window and shifts
// it to t=0 so the overlap panels' 0-based axis lines up. An instant query (instant=true)
// evaluates each leg once at its  snapshot's window end and keeps absolute time: its consumers (instance
// discovery) read labels, and a single evaluation per snapshot avoids pulling the whole window as a matrix,
// which for long snapshots exceeds the upstream's per-series point limit.
func (h *Handler) serveOverlap(w http.ResponseWriter, r *http.Request, ids []string, instant bool) {
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
			env, route, legErr := h.overlapLeg(ctx, query, id, step, instant)
			if env == nil {
				legErrs[i] = fmt.Sprintf("snapshot %s: %s", id, legErr)
				return nil
			}
			if !instant {
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
		// No leg produced a result. Forwarding the multi-snapshot query to the
		// upstream would overlay absolute-time series as if they were aligned,
		// or return an empty success, and either hides the cause. Report it.
		writePromError(w, http.StatusUnprocessableEntity, "execution",
			"no snapshot in the comparison could be evaluated: "+strings.Join(warnings, "; "))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(merged)
}

// overlapLeg runs the query for one snapshot via its own store: over the
// snapshot's stored window for a range query, or at the window's end for an
// instant query. A leg that can't produce data returns a nil envelope plus the
// reason, so it drops out of the comparison rather than failing it, and the
// reason reaches the caller as a warning instead of vanishing.
func (h *Handler) overlapLeg(ctx context.Context, query, id, step string, instant bool) (*promEnvelope, router.Route, string) {
	route := h.router.Resolve(ctx, id)
	if !route.HasWindow {
		return nil, route, "no time window in snapshot metadata"
	}
	q := replaceJobMatcher(query, id)

	if route.Store == router.StoreCouchbase {
		var res *cbeval.Result
		var err error
		if instant {
			res, err = h.evaluator.InstantQuery(ctx, q, route.End)
		} else {
			res, err = h.evaluator.RangeQuery(ctx, q, route.Start, route.End, parseStepParam(step))
		}
		if err != nil {
			return nil, route, "query failed: " + err.Error()
		}
		return fromCBResult(res), route, ""
	}

	body, status, err := h.upstreamLeg(ctx, q, route.Start, route.End, step, instant)
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

// upstreamLeg issues the leg's upstream call: query_range over [start, end] with step, or an instant query at end.
func (h *Handler) upstreamLeg(ctx context.Context, q string, start, end time.Time, step string, instant bool) ([]byte, int, error) {
	if instant {
		return h.prometheus.Query(ctx, q, end)
	}
	return h.prometheus.QueryRange(ctx, q, start, end, step)
}
