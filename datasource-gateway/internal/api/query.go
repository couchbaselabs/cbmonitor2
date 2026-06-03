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
// snapshots are translated and executed (wired in a later task). Multi-snapshot
// (overlap) and job-less queries resolve to a plain passthrough.
func (h *Handler) handleQueryRange(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writePromError(w, http.StatusBadRequest, "bad_data", "failed to parse request: "+err.Error())
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
