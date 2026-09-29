package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	Up = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "config_manager_up",
		Help: "1 if the config-manager service is up.",
	})
	StartTime = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "config_manager_start_time_seconds",
		Help: "Unix timestamp (seconds) when the service started.",
	})
	ActiveSnapshots = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "config_manager_active_snapshots",
		Help: "Number of active snapshot .yml files in the agent directory.",
	})
	SnapshotsCreated = promauto.NewCounter(prometheus.CounterOpts{
		Name: "config_manager_snapshots_created_total",
		Help: "Total snapshots successfully created.",
	})
	SnapshotsDeleted = promauto.NewCounter(prometheus.CounterOpts{
		Name: "config_manager_snapshots_deleted_total",
		Help: "Total snapshots successfully deleted via API.",
	})
	SnapshotsPatched = promauto.NewCounter(prometheus.CounterOpts{
		Name: "config_manager_snapshots_patched_total",
		Help: "Total snapshots successfully patched.",
	})
	SnapshotsExpired = promauto.NewCounter(prometheus.CounterOpts{
		Name: "config_manager_snapshots_expired_total",
		Help: "Total stale snapshots taken out of service by the manager loop.",
	})
	SnapshotsRestored = promauto.NewCounter(prometheus.CounterOpts{
		Name: "config_manager_snapshots_restored_total",
		Help: "Total expired snapshots put back in service by a late keepalive or re-registration.",
	})
	// SweepLastSuccess is the manager loop's heartbeat: alert when it stops
	// advancing, because nothing else stops scraping for a client that died.
	SweepLastSuccess = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "config_manager_manager_loop_last_run_timestamp_seconds",
		Help: "Unix time of the manager loop's last successful sweep.",
	})
	SweepFailures = promauto.NewCounter(prometheus.CounterOpts{
		Name: "config_manager_manager_loop_failures_total",
		Help: "Total manager loop sweeps that failed and were retried.",
	})

	HTTPRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "config_manager_http_requests_total",
		Help: "API requests by route, method and status code.",
	}, []string{"route", "method", "code"})
	HTTPDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "config_manager_http_request_duration_seconds",
		Help:    "API request latency by route and method.",
		Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30},
	}, []string{"route", "method"})

	MetadataCollectionFailures = promauto.NewCounter(prometheus.CounterOpts{
		Name: "config_manager_metadata_collection_failures_total",
		Help: "Total hosts whose cluster metadata could not be collected for a new snapshot.",
	})
	MetadataWritesQueued = promauto.NewCounter(prometheus.CounterOpts{
		Name: "config_manager_metadata_writes_queued_total",
		Help: "Total metadata writes queued because the metadata store could not take them.",
	})
	MetadataWritesDropped = promauto.NewCounter(prometheus.CounterOpts{
		Name: "config_manager_metadata_writes_dropped_total",
		Help: "Total queued metadata writes dropped after their retry window.",
	})
	PendingMetadataWrites = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "config_manager_pending_metadata_writes",
		Help: "Metadata writes currently queued for retry.",
	})
	// MetadataStorageInfo is 1 for the storage in use. "file" means metadata
	// recording is turned off in the configuration.
	MetadataStorageInfo = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "config_manager_metadata_storage_info",
		Help: "1 for the metadata storage in use; \"file\" records nothing.",
	}, []string{"type"})
)

// Instrument wraps an API route to count its requests and time them. route
// is a fixed label, so snapshot IDs never become label values.
func Instrument(route string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rec, r)
		method := methodLabel(r.Method)
		HTTPDuration.WithLabelValues(route, method).Observe(time.Since(start).Seconds())
		HTTPRequests.WithLabelValues(route, method, strconv.Itoa(rec.status)).Inc()
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

// methodLabel keeps the label set bounded against arbitrary request methods.
func methodLabel(m string) string {
	switch m {
	case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodHead, http.MethodOptions:
		return m
	}
	return "other"
}

func MarkUp() {
	Up.Set(1)
	StartTime.Set(float64(time.Now().Unix()))
}

func SetActiveSnapshots(n int) { ActiveSnapshots.Set(float64(n)) }

func Handler() http.Handler { return promhttp.Handler() }
