package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"time"

	"github.com/couchbase/datasource-gateway/internal/router"
)

// jobSelectorRe captures the value of a positive job matcher (job="..." or
// job=~"...") in a PromQL query. Negative matchers (!=, !~) don't match
// because the '!' breaks the `job\s*=` prefix. The leading word boundary
// keeps labels that merely end in "job" (sub_job, xdcr_job) from being taken for the snapshot matcher.
var jobSelectorRe = regexp.MustCompile(`\bjob\s*=~?\s*"([^"]*)"`)

// handleQueryRange serves /api/v1/query_range. It resolves the snapshot's route
// (cached) and forks: Prometheus-backed snapshots are forwarded to the upstream
// with start/end rewritten to the snapshot's stored window; Couchbase-backed
// snapshots are evaluated by the PromQL engine over SQL++-fetched samples.
// Multi-snapshot job matchers (overlap) fan out per snapshot and merge on a
// t=0-aligned axis; job-less queries resolve to a plain passthrough.
func (h *Handler) handleQueryRange(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writePromError(w, http.StatusBadRequest, "bad_data", "failed to parse request: "+err.Error())
		return
	}

	ids := splitJobs(r.Form.Get("query"))
	if len(ids) > 1 {
		h.serveOverlap(w, r, ids, false)
		return
	}

	route := h.router.Resolve(r.Context(), soleJob(ids))

	if route.Store == router.StoreCouchbase {
		h.serveCouchbaseQueryRange(w, r, route)
		return
	}

	// Prometheus-backed: confine the window to the snapshot and pass through.
	if route.HasWindow {
		start, end := confineRange(route, r.Form)
		r.Form.Set("start", strconv.FormatInt(start.Unix(), 10))
		r.Form.Set("end", strconv.FormatInt(end.Unix(), 10))
	}
	forwardForm(r)
	h.prometheus.ReverseProxy().ServeHTTP(w, r)
}

// confineRange resolves the window to query for a snapshot-scoped request.
//
// The request's own range is honoured wherever it overlaps the snapshot,
// this is what keeps a phase selection or a  drag-zoom (both of which arrive as absolute times inside the window) at the
// resolution the client asked for. Only a range that misses the snapshot entirely, a stale or global time picker, e.g. "now-1h" against a snapshot
// from last month, is replaced by the full window.
//
// Preserving the requested range also keeps the point count in line with the
// step Grafana chose for it; substituting a wider window would leave the step
// sized for the narrower range and can exceed the upstream's per-series point limit.
func confineRange(route router.Route, form url.Values) (time.Time, time.Time) {
	reqStart, ok1 := parseUnixSeconds(form.Get("start"))
	reqEnd, ok2 := parseUnixSeconds(form.Get("end"))
	if !ok1 || !ok2 || !reqEnd.After(reqStart) {
		return route.Start, route.End
	}

	start, end := reqStart, reqEnd
	if start.Before(route.Start) {
		start = route.Start
	}
	if end.After(route.End) {
		end = route.End
	}
	if !end.After(start) {
		// The requested range lies wholly outside the snapshot.
		return route.Start, route.End
	}
	return start, end
}

// soleJob returns the snapshot ID when the query's job matcher resolves to
// exactly one snapshot, else "". A matcher whose alternation repeats or pads a
// single snapshot (job=~"a|a", job=~"a|") still routes on that snapshot.
func soleJob(ids []string) string {
	if len(ids) != 1 {
		return ""
	}
	return ids[0]
}

// handleQuery serves instant /api/v1/query. Single Couchbase-backed snapshots
// evaluate at the snapshot's end (instance-discovery queries arrive with the
// dashboard's own time, which need not fall inside the stored window);
// Prometheus-backed snapshots pass through with the evaluation time clamped
// into the window. Multi-snapshot matchers fan out per snapshot, each leg
// evaluated as an instant query at its own window end, and the vectors are
// merged with absolute timestamps; their consumers (instance discovery) read series labels.
func (h *Handler) handleQuery(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writePromError(w, http.StatusBadRequest, "bad_data", "failed to parse request: "+err.Error())
		return
	}

	ids := splitJobs(r.Form.Get("query"))
	if len(ids) > 1 {
		h.serveOverlap(w, r, ids, true)
		return
	}

	route := h.router.Resolve(r.Context(), soleJob(ids))

	if route.Store == router.StoreCouchbase {
		ts := time.Now()
		if route.HasWindow {
			ts = confineInstant(route, r.Form)
		} else if t, ok := parseUnixSeconds(r.Form.Get("time")); ok {
			ts = t
		}
		result, err := h.evaluator.InstantQuery(r.Context(), r.Form.Get("query"), ts)
		if err != nil {
			writePromError(w, http.StatusUnprocessableEntity, "execution", err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(result)
		return
	}

	if route.HasWindow {
		r.Form.Set("time", strconv.FormatInt(confineInstant(route, r.Form).Unix(), 10))
	}
	forwardForm(r)
	h.prometheus.ReverseProxy().ServeHTTP(w, r)
}

// confineInstant picks the evaluation instant for a snapshot-scoped instant query:
// the requested time when it falls inside the snapshot, else the snapshot's end.
// (a dashboard's own "now" is outside a finished snapshot, and evaluating there would return nothing).
func confineInstant(route router.Route, form url.Values) time.Time {
	ts, ok := parseUnixSeconds(form.Get("time"))
	if !ok || ts.Before(route.Start) || ts.After(route.End) {
		return route.End
	}
	return ts
}

// handleMetaEndpoint serves /api/v1/labels, /api/v1/series and
// /api/v1/label/{name}/values. These stay passthrough, but when the request's
// match[] selectors identify a single snapshot with a known window, start/end
// are rewritten to it so the upstream's lookback covers the snapshot
// regardless of the dashboard's time picker.
func (h *Handler) handleMetaEndpoint(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writePromError(w, http.StatusBadRequest, "bad_data", "failed to parse request: "+err.Error())
		return
	}

	if id := singleJobFromMatchers(r.Form["match[]"]); id != "" {
		if route := h.router.Resolve(r.Context(), id); route.HasWindow {
			r.Form.Set("start", strconv.FormatInt(route.Start.Unix(), 10))
			r.Form.Set("end", strconv.FormatInt(route.End.Unix(), 10))
		}
	}
	forwardForm(r)
	h.prometheus.ReverseProxy().ServeHTTP(w, r)
}

// singleJobFromMatchers returns the snapshot ID when every match[] selector
// that carries a job matcher agrees on a single snapshot, else "".
func singleJobFromMatchers(matchers []string) string {
	id := ""
	for _, m := range matchers {
		j := soleJob(splitJobs(m))
		if j == "" {
			continue
		}
		if id != "" && id != j {
			return ""
		}
		id = j
	}
	return id
}

// serveCouchbaseQueryRange evaluates the PromQL against Couchbase-backed
// samples via the Prometheus engine and writes the matrix result. It evaluates
// over the snapshot's stored window (from the router) so the panel resolves
// against the snapshot regardless of the dashboard's time picker.
func (h *Handler) serveCouchbaseQueryRange(w http.ResponseWriter, r *http.Request, route router.Route) {
	start, end, ok := evalRange(route, r.Form)
	if !ok {
		writePromError(w, http.StatusBadRequest, "bad_data", "no snapshot window and missing/invalid start/end")
		return
	}

	result, err := h.evaluator.RangeQuery(r.Context(), r.Form.Get("query"), start, end, parseStepParam(r.Form.Get("step")))
	if err != nil {
		writePromError(w, http.StatusUnprocessableEntity, "execution", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(result)
}

// evalRange picks the evaluation window: the request's range confined to the
// snapshot when a window is known, else the request's own start/end (Unix seconds, Prometheus-style).
func evalRange(route router.Route, form url.Values) (time.Time, time.Time, bool) {
	if route.HasWindow {
		start, end := confineRange(route, form)
		return start, end, true
	}
	start, ok1 := parseUnixSeconds(form.Get("start"))
	end, ok2 := parseUnixSeconds(form.Get("end"))
	if !ok1 || !ok2 {
		return time.Time{}, time.Time{}, false
	}
	return start, end, true
}

// parseStepParam parses the query_range step, accepting a Go duration ("15s")
// or bare seconds ("15"); defaults to 15s.
func parseStepParam(s string) time.Duration {
	if s == "" {
		return 15 * time.Second
	}
	if d, err := time.ParseDuration(s); err == nil && d > 0 {
		return d
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil && f > 0 {
		return time.Duration(f * float64(time.Second))
	}
	return 15 * time.Second
}

func parseUnixSeconds(s string) (time.Time, bool) {
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return time.Time{}, false
	}
	sec := int64(f)
	return time.Unix(sec, int64((f-float64(sec))*1e9)), true
}

// forwardForm moves the merged form params onto the URL query and empties the
// body, so the reverse proxy forwards the (possibly rewritten) params
// uniformly for GET and POST.
func forwardForm(r *http.Request) {
	r.URL.RawQuery = r.Form.Encode()
	r.Body = http.NoBody
	r.ContentLength = 0
	r.Header.Del("Content-Type")
	r.Header.Del("Content-Length")
}

// writePromError writes a Prometheus-API error envelope.
func writePromError(w http.ResponseWriter, code int, errorType, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":    "error",
		"errorType": errorType,
		"error":     msg,
	})
}
