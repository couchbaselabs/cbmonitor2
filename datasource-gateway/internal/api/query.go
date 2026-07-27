package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/couchbase/datasource-gateway/internal/router"
)

// jobSelectorRe captures the value of a positive job matcher (job="..." or
// job=~"...") in a PromQL query. Negative matchers (!=, !~) don't match
// because the '!' breaks the `job\s*=` prefix.
var jobSelectorRe = regexp.MustCompile(`job\s*=~?\s*"([^"]*)"`)

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

	if ids := splitJobs(r.Form.Get("query")); len(ids) > 1 {
		h.serveOverlap(w, r, ids, true)
		return
	}

	route := h.router.Resolve(r.Context(), singleJob(r.Form.Get("query")))

	if route.Store == router.StoreCouchbase {
		h.serveCouchbaseQueryRange(w, r, route)
		return
	}

	// Prometheus-backed: rewrite the window (when known) and pass through.
	if route.HasWindow {
		r.Form.Set("start", strconv.FormatInt(route.Start.Unix(), 10))
		r.Form.Set("end", strconv.FormatInt(route.End.Unix(), 10))
	}
	forwardForm(r)
	h.prometheus.ReverseProxy().ServeHTTP(w, r)
}

// handleQuery serves instant /api/v1/query. Single Couchbase-backed snapshots
// evaluate at the snapshot's end (instance-discovery queries arrive with the
// dashboard's own time, which need not fall inside the stored window);
// Prometheus-backed snapshots pass through with the evaluation time clamped
// into the window. Multi-snapshot matchers fan out like overlap range queries
// but keep absolute time — their consumers (instance discovery) only read
// series labels, mirroring the pre-gateway proxy's behavior.
func (h *Handler) handleQuery(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writePromError(w, http.StatusBadRequest, "bad_data", "failed to parse request: "+err.Error())
		return
	}

	if ids := splitJobs(r.Form.Get("query")); len(ids) > 1 {
		h.serveOverlap(w, r, ids, false)
		return
	}

	route := h.router.Resolve(r.Context(), singleJob(r.Form.Get("query")))

	if route.Store == router.StoreCouchbase {
		ts := time.Now()
		if route.HasWindow {
			ts = route.End
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
		r.Form.Set("time", strconv.FormatInt(route.End.Unix(), 10))
	}
	forwardForm(r)
	h.prometheus.ReverseProxy().ServeHTTP(w, r)
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
		j := singleJob(m)
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

// evalRange picks the evaluation window: the snapshot's stored window when
// known, else the request's own start/end (Unix seconds, Prometheus-style).
func evalRange(route router.Route, form url.Values) (time.Time, time.Time, bool) {
	if route.HasWindow {
		return route.Start, route.End, true
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

// singleJob returns the snapshot ID from a single-snapshot job matcher, or ""
// when the query has no job matcher or targets multiple snapshots (overlap,
// signalled by a '|' in the matcher value).
func singleJob(query string) string {
	m := jobSelectorRe.FindStringSubmatch(query)
	if len(m) < 2 {
		return ""
	}
	val := strings.TrimSpace(m[1])
	if val == "" || strings.Contains(val, "|") {
		return ""
	}
	return val
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
