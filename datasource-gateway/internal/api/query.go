package api

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"

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

// serveCouchbaseQueryRange will translate the PromQL to SQL++, execute it
// against Couchbase, and shape the result as Prometheus JSON. Wired in a later
// task; for now it returns a clear, parseable error so the routing decision is
// observable without silently returning empty data.
func (h *Handler) serveCouchbaseQueryRange(w http.ResponseWriter, _ *http.Request, route router.Route) {
	writePromError(w, http.StatusNotImplemented, "not_implemented",
		"Couchbase-backed query execution for snapshot "+route.Snapshot+" is not yet wired")
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
