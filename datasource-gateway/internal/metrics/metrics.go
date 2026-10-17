// Package metrics holds the gateway's Prometheus metrics. No label carries a
// snapshot ID, query text or user: each would add series without bound.
package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// latencyBuckets run to 30 s for the Prometheus path, plus 60 s and 120 s for
// queries evaluated over Couchbase Server samples.
var latencyBuckets = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120}

// Routing decision reasons, the reason label of RouteDecisions.
const (
	// ReasonNoSnapshot: the query names no single snapshot.
	ReasonNoSnapshot = "no_snapshot"
	// ReasonCouchbaseDisabled: snapshot metadata is turned off.
	ReasonCouchbaseDisabled = "couchbase_disabled"
	// ReasonCacheHit: a finished snapshot's route came from the cache.
	ReasonCacheHit = "cache_hit"
	// ReasonResolved: a finished snapshot's metadata was read and cached.
	ReasonResolved = "resolved"
	// ReasonLive: a running snapshot's metadata was read; it is not cached,
	// because its window keeps growing.
	ReasonLive = "live"
	// ReasonNotFound: no metadata document, as for a job that is not a
	// snapshot. The query runs without a window.
	ReasonNotFound = "not_found"
	// ReasonLookupFailed: reading the metadata failed. The query runs without
	// the snapshot's window, so the panel can show data outside it.
	ReasonLookupFailed = "lookup_failed"
	// ReasonNoWindow: the metadata has no usable start or end.
	ReasonNoWindow = "no_window"
)

var (
	HTTPRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "datasource_gateway_http_requests_total",
		Help: "Requests by route and status code.",
	}, []string{"route", "code"})
	HTTPDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "datasource_gateway_http_request_duration_seconds",
		Help:    "Request latency by route.",
		Buckets: latencyBuckets,
	}, []string{"route"})

	RouteDecisions = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "datasource_gateway_route_decisions_total",
		Help: "Snapshot routing decisions by store and reason.",
	}, []string{"store", "reason"})
	MetadataLookupDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "datasource_gateway_metadata_lookup_duration_seconds",
		Help:    "Snapshot metadata lookups by result (ok, not_found, error).",
		Buckets: latencyBuckets[:12],
	}, []string{"result"})

	OverlapRequests = promauto.NewCounter(prometheus.CounterOpts{
		Name: "datasource_gateway_overlap_requests_total",
		Help: "Queries that compare several snapshots.",
	})
	OverlapSnapshots = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "datasource_gateway_overlap_snapshots",
		Help:    "Snapshots named by a comparison query, before the cap.",
		Buckets: []float64{2, 3, 4, 5, 6},
	})
	OverlapLegFailures = promauto.NewCounter(prometheus.CounterOpts{
		Name: "datasource_gateway_overlap_leg_failures_total",
		Help: "Snapshots dropped from a comparison because their query failed.",
	})
	OverlapTruncated = promauto.NewCounter(prometheus.CounterOpts{
		Name: "datasource_gateway_overlap_truncated_total",
		Help: "Comparisons cut to the first six snapshots.",
	})
	WindowClamped = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "datasource_gateway_window_clamped_total",
		Help: "Requests whose time range (range) or evaluation time (instant) was moved into the snapshot's window.",
	}, []string{"kind"})
	StepFloored = promauto.NewCounter(prometheus.CounterOpts{
		Name: "datasource_gateway_step_floored_total",
		Help: "Range queries whose step was raised to stay within the per-series point limit.",
	})

	UpstreamRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "datasource_gateway_upstream_requests_total",
		Help: "Requests to a backend (mimir, couchbase) by result (ok, 4xx, 5xx, error).",
	}, []string{"backend", "result"})
	UpstreamDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "datasource_gateway_upstream_request_duration_seconds",
		Help:    "Backend request latency by backend.",
		Buckets: latencyBuckets,
	}, []string{"backend"})
)

// RegisterBuildInfo exports the running build's version and revision as a
// constant 1, so a dashboard shows which build is live.
func RegisterBuildInfo(version, revision string) {
	promauto.NewGauge(prometheus.GaugeOpts{
		Name:        "datasource_gateway_build_info",
		Help:        "1, labelled with the running build's version and revision.",
		ConstLabels: prometheus.Labels{"version": version, "revision": revision},
	}).Set(1)
}

// RegisterState exports the router cache size and whether Couchbase Server is
// ready, read from the running components at scrape time.
func RegisterState(cacheEntries func() int, couchbaseReady func() bool) {
	promauto.NewGaugeFunc(prometheus.GaugeOpts{
		Name: "datasource_gateway_router_cache_entries",
		Help: "Snapshot routes held in the router cache.",
	}, func() float64 { return float64(cacheEntries()) })
	promauto.NewGaugeFunc(prometheus.GaugeOpts{
		Name: "datasource_gateway_couchbase_ready",
		Help: "1 when snapshot metadata can be read from Couchbase Server; 0 sends every query without a snapshot window.",
	}, func() float64 {
		if couchbaseReady() {
			return 1
		}
		return 0
	})
}

// Upstream request results, the result label of UpstreamRequests.
const (
	ResultOK = "ok"
	// ResultError: the request failed without a response.
	ResultError = "error"
)

// ObserveUpstream records one backend request.
func ObserveUpstream(backend, result string, took time.Duration) {
	UpstreamDuration.WithLabelValues(backend).Observe(took.Seconds())
	UpstreamRequests.WithLabelValues(backend, result).Inc()
}

// ResultForStatus maps an HTTP status to an upstream result; 0 means the
// request got no response.
func ResultForStatus(status int) string {
	switch {
	case status == 0:
		return ResultError
	case status >= 500:
		return "5xx"
	case status >= 400:
		return "4xx"
	default:
		return ResultOK
	}
}

// Instrument wraps a route to count its requests and time them. route is a
// fixed label.
func Instrument(route string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rec, r)
		HTTPDuration.WithLabelValues(route).Observe(time.Since(start).Seconds())
		HTTPRequests.WithLabelValues(route, strconv.Itoa(rec.status)).Inc()
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (r *statusRecorder) WriteHeader(code int) {
	if !r.wroteHeader {
		r.status = code
		r.wroteHeader = true
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	r.wroteHeader = true
	return r.ResponseWriter.Write(b)
}

// Unwrap lets http.ResponseController reach the underlying writer, which the
// reverse proxy uses to flush streamed responses.
func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

func Handler() http.Handler { return promhttp.Handler() }
