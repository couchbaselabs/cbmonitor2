package metrics

import (
	"net/http"
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
)

func MarkUp() {
	Up.Set(1)
	StartTime.Set(float64(time.Now().Unix()))
}

func SetActiveSnapshots(n int) { ActiveSnapshots.Set(float64(n)) }

func Handler() http.Handler { return promhttp.Handler() }
