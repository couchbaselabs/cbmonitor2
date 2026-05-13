package plugin

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/couchbase/cbmonitor/pkg/handlers"
	"github.com/couchbase/cbmonitor/pkg/services"
	sdklog "github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// handlePing is an example HTTP GET resource that returns a {"message": "ok"} JSON response.
func (a *App) handlePing(w http.ResponseWriter, req *http.Request) {
	w.Header().Add("Content-Type", "application/json")
	if _, err := w.Write([]byte(`{"message": "ok"}`)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// handleEcho is an example HTTP POST resource that accepts a JSON with a "message" key and
// returns to the client whatever it is sent.
func (a *App) handleEcho(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Add("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(body); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// handleGetDatasourceConfig returns the datasource configuration to the UI.
// Values are sourced from the Grafana-managed plugin settings (jsonData).
func (a *App) handleGetDatasourceConfig(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	config := map[string]interface{}{
		"defaultDataSource":   a.settings.DefaultDataSource(),
		"prometheusAvailable": a.settings.PrometheusDatasource.Enabled,
		"couchbaseAvailable":  a.settings.CouchbaseDatasource.Enabled,
		"reconciliation":      a.getReconcileState(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(config); err != nil {
		log.Printf("Error encoding response: %v", err)
		return
	}
}

// handleReconcileDatasources forces a synchronous reconciliation pass.
// Exposed so the AppConfig save flow can apply URL/credential changes
// before the page reloads, instead of waiting for the lazy first-request path.
// Returns the post-run reconciliation status as JSON.
func (a *App) handleReconcileDatasources(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Mark the lazy gate as already-fired so a subsequent CallResource
	// doesn't trigger a duplicate background pass.
	a.reconcileOnce.Do(func() {})
	a.reconcileNow(req.Context())

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(a.getReconcileState()); err != nil {
		log.Printf("Error encoding response: %v", err)
	}
}

// registerRoutes takes a *http.ServeMux and registers HTTP handlers based
// on the plugin settings. Feature-specific routes are only registered when
// their owning feature is enabled.
func (a *App) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/ping", a.handlePing)
	mux.HandleFunc("/echo", a.handleEcho)

	mux.HandleFunc("/config/datasources", a.handleGetDatasourceConfig)
	mux.HandleFunc("/admin/reconcile-datasources", a.handleReconcileDatasources)
	mux.HandleFunc("/healthcheck/connection", a.handleHealthCheckConnection)

	if a.settings.CouchbaseDatasource.Enabled {
		a.setupMetricsRoutes(mux)
		a.setupPrometheusRoutes(mux)
	}

	if a.settings.Snapshots.Enabled {
		a.setupSnapshotRoutes(mux)
	}
}

// setupMetricsRoutes registers the metrics API routes against the Couchbase
// datasource bucket. Only called when CouchbaseDatasource.Enabled is true.
func (a *App) setupMetricsRoutes(mux *http.ServeMux) {
	cb := a.settings.CouchbaseServer
	bucket := a.settings.CouchbaseDatasource.Bucket

	couchbaseService, err := services.NewCouchbaseService(cb.ConnectionString, cb.Username, cb.Password, bucket)
	if err != nil {
		log.Printf("Warning: Failed to initialize Couchbase service: %v", err)
		log.Printf("Metrics endpoints will return mock data")
		couchbaseService = nil
	}

	metricsHandler := handlers.NewMetricsHandler(couchbaseService)

	mux.HandleFunc("/metrics/health", metricsHandler.HandleHealthCheck)
	mux.HandleFunc("/metrics/", func(w http.ResponseWriter, r *http.Request) {
		if len(r.URL.Path) > 20 {
			metricsHandler.HandleGetMetricHistory(w, r)
		} else {
			metricsHandler.HandleGetComponentMetrics(w, r)
		}
	})
}

// setupSnapshotRoutes registers the snapshot API routes against the
// Snapshots (metadata) bucket. Only called when Snapshots.Enabled is true.
func (a *App) setupSnapshotRoutes(mux *http.ServeMux) {
	cb := a.settings.CouchbaseServer
	snapshotBucket := a.settings.Snapshots.Bucket

	sdklog.DefaultLogger.Info("setupSnapshotRoutes: connecting to Couchbase",
		"connectionString", cb.ConnectionString,
		"username", cb.Username,
		"snapshotBucket", snapshotBucket)
	snapshotService, err := services.NewSnapshotService(cb.ConnectionString, cb.Username, cb.Password, snapshotBucket)
	if err != nil {
		sdklog.DefaultLogger.Error("setupSnapshotRoutes: NewSnapshotService failed", "error", err.Error())
		log.Printf("Warning: Failed to initialize Snapshot service: %v", err)
		log.Printf("Snapshot endpoints will not be available")
		snapshotService = nil
	} else {
		sdklog.DefaultLogger.Info("setupSnapshotRoutes: NewSnapshotService ok")
	}

	// If the Couchbase datasource is also enabled, snapshot metric queries
	// can reach the showfast bucket; otherwise leave the metric service nil
	// and let handlers fall back gracefully.
	var couchbaseService *services.CouchbaseService
	if a.settings.CouchbaseDatasource.Enabled {
		metricBucket := a.settings.CouchbaseDatasource.Bucket
		couchbaseService, err = services.NewCouchbaseService(cb.ConnectionString, cb.Username, cb.Password, metricBucket)
		if err != nil {
			sdklog.DefaultLogger.Error("setupSnapshotRoutes: NewCouchbaseService failed", "error", err.Error())
			log.Printf("Warning: Failed to initialize Couchbase service for snapshot metrics: %v", err)
			couchbaseService = nil
		} else {
			sdklog.DefaultLogger.Info("setupSnapshotRoutes: NewCouchbaseService ok")
		}
	}

	snapshotHandler := handlers.NewSnapshotHandler(snapshotService, couchbaseService, snapshotBucket)

	mux.HandleFunc("/snapshots/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/snapshots/")
		pathParts := strings.Split(strings.Trim(path, "/"), "/")

		if len(pathParts) == 1 && pathParts[0] != "" {
			snapshotHandler.HandleGetSnapshot(w, r)
		} else if len(pathParts) >= 3 && pathParts[1] == "metrics" {
			if len(pathParts) == 3 {
				snapshotHandler.HandleGetMetric(w, r)
			} else if len(pathParts) == 4 && pathParts[3] == "summary" {
				snapshotHandler.HandleGetMetricSummary(w, r)
			} else if len(pathParts) >= 5 && pathParts[3] == "phases" {
				if len(pathParts) == 5 {
					snapshotHandler.HandleGetMetricPhase(w, r)
				} else if len(pathParts) == 6 && pathParts[5] == "summary" {
					snapshotHandler.HandleGetMetricPhaseSummary(w, r)
				} else {
					http.Error(w, "Invalid path", http.StatusBadRequest)
				}
			} else {
				http.Error(w, "Invalid path", http.StatusBadRequest)
			}
		} else if path == "" || path == "/" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		} else {
			http.Error(w, "Not found", http.StatusNotFound)
		}
	})

	log.Printf("Snapshot routes registered: /snapshots/{id}, /snapshots/{id}/metrics/{metric}, /snapshots/{id}/metrics/{metric}/phases/{phase}")
}

// setupPrometheusRoutes registers the Prometheus Query API routes backed
// by the Couchbase datasource bucket. Only called when
// CouchbaseDatasource.Enabled is true.
func (a *App) setupPrometheusRoutes(mux *http.ServeMux) {
	cb := a.settings.CouchbaseServer
	bucket := a.settings.CouchbaseDatasource.Bucket

	couchbaseService, err := services.NewCouchbaseService(cb.ConnectionString, cb.Username, cb.Password, bucket)
	if err != nil {
		log.Printf("Warning: Failed to initialize Couchbase service for Prometheus API: %v", err)
		log.Printf("Prometheus Query API endpoints will not be available")
		couchbaseService = nil
	}

	promQLHandler := handlers.NewPromQLHandler(couchbaseService)

	mux.HandleFunc("/query", promQLHandler.HandleQuery)
	mux.HandleFunc("/query_range", promQLHandler.HandleQueryRange)
	mux.HandleFunc("/series", promQLHandler.HandleSeries)

	log.Printf("PromQL Query API routes registered: /query, /query_range, /series")
}

// handleHealthCheckConnection performs a fresh, short-timeout probe of the
// configured Couchbase snapshot bucket. The endpoint always responds with HTTP
// 200; failures (including "snapshots disabled") are encoded inside the JSON
// body so the frontend can render per-check status without distinguishing
// transport vs application errors.
func (a *App) handleHealthCheckConnection(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !a.settings.Snapshots.Enabled {
		resp := map[string]any{
			"couchbase": map[string]any{
				"ok":     false,
				"bucket": "",
				"error":  "snapshots disabled",
			},
		}
		w.Header().Set("Content-Type", "application/json")
		if encErr := json.NewEncoder(w).Encode(resp); encErr != nil {
			log.Printf("[handleHealthCheckConnection] error encoding response: %v", encErr)
		}
		return
	}

	cb := a.settings.CouchbaseServer
	bucket := a.settings.Snapshots.Bucket

	ctx, cancel := context.WithTimeout(req.Context(), 6*time.Second)
	defer cancel()

	start := time.Now()
	err := services.ProbeCouchbaseBucket(ctx, cb.ConnectionString, cb.Username, cb.Password, bucket, 5*time.Second)
	resp := map[string]any{
		"couchbase": map[string]any{
			"ok":               err == nil,
			"bucket":           bucket,
			"connectionString": cb.ConnectionString,
			"latencyMs":        time.Since(start).Milliseconds(),
			"error":            errString(err),
		},
	}

	w.Header().Set("Content-Type", "application/json")
	if encErr := json.NewEncoder(w).Encode(resp); encErr != nil {
		log.Printf("[handleHealthCheckConnection] error encoding response: %v", encErr)
	}
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
