package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/couchbase/datasource-gateway/internal/couchbase"
)

// jobSelectorRe captures the value of a positive job matcher (job="..." or
// job=~"...") in a PromQL query. Negative matchers (!=, !~) don't match
// because the '!' breaks the `job\s*=` prefix.
var jobSelectorRe = regexp.MustCompile(`job\s*=~?\s*"([^"]*)"`)

// handleQueryRange serves /api/v1/query_range. For a single-snapshot query it
// rewrites start/end to the snapshot's stored time window (from Couchbase
// metadata) before forwarding upstream, so a historical snapshot's panels
// resolve against the snapshot's absolute window regardless of the dashboard's
// time picker. Multi-snapshot (overlap) queries, queries with no job matcher,
// and failed lookups are forwarded with their original time range.
func (h *Handler) handleQueryRange(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writePromError(w, http.StatusBadRequest, "bad_data", "failed to parse request: "+err.Error())
		return
	}

	h.applySnapshotWindow(r.Context(), r.Form)

	// Re-emit the (possibly rewritten) params onto the URL so the reverse
	// proxy forwards them uniformly. This also reconstructs the request after
	// ParseForm drained a POST body.
	forwardForm(r)

	h.prometheus.ReverseProxy().ServeHTTP(w, r)
}

// applySnapshotWindow rewrites form's start/end to the snapshot window when the
// query targets a single snapshot and Couchbase metadata is available.
func (h *Handler) applySnapshotWindow(ctx context.Context, form url.Values) {
	if h.couchbase == nil || !h.couchbase.Enabled() {
		return
	}
	job := singleJob(form.Get("query"))
	if job == "" {
		return
	}
	md, err := h.couchbase.GetSnapshotMetadata(ctx, job)
	if err != nil {
		// Forward unchanged; the upstream still answers with the original range.
		return
	}
	if start, end, ok := snapshotWindowUnix(md); ok {
		form.Set("start", start)
		form.Set("end", end)
	}
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
// uniformly for both GET and POST.
func forwardForm(r *http.Request) {
	r.URL.RawQuery = r.Form.Encode()
	r.Body = http.NoBody
	r.ContentLength = 0
	r.Header.Del("Content-Type")
	r.Header.Del("Content-Length")
}

// snapshotWindowUnix returns the snapshot's [start,end] as Unix-second strings.
func snapshotWindowUnix(md *couchbase.Metadata) (string, string, bool) {
	start, ok1 := parseSnapshotTime(md.TSStart)
	end, ok2 := parseSnapshotTime(md.TSEnd)
	if !ok1 || !ok2 {
		return "", "", false
	}
	return strconv.FormatInt(start.Unix(), 10), strconv.FormatInt(end.Unix(), 10), true
}

// parseSnapshotTime parses the ISO timestamps stored in snapshot metadata,
// tolerating RFC3339, a zone-less layout, and the space-separated variant the
// proxy accepts.
func parseSnapshotTime(s string) (time.Time, bool) {
	layouts := []string{time.RFC3339, time.RFC3339Nano, "2006-01-02T15:04:05", "2006-01-02 15:04:05"}
	for _, l := range layouts {
		if t, err := time.Parse(l, s); err == nil {
			return t, true
		}
	}
	if t, err := time.Parse(time.RFC3339, strings.Replace(s, " ", "T", 1)); err == nil {
		return t, true
	}
	return time.Time{}, false
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
