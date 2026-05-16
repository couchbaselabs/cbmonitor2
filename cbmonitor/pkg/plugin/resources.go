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

	settingsBlock := map[string]any{
		"valid": a.settingsError == "",
	}
	if a.settingsError != "" {
		settingsBlock["error"] = a.settingsError
	}

	config := map[string]interface{}{
		"defaultDataSource":   a.settings.DefaultDataSource(),
		"prometheusAvailable": a.settings.PrometheusDatasource.Enabled,
		"couchbaseAvailable":  a.settings.CouchbaseDatasource.Enabled,
		"reconciliation":      a.getReconcileState(),
		"settings":            settingsBlock,
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
		a.setupPrometheusRoutes(mux)
	}

	if a.settings.Snapshots.Enabled {
		a.setupSnapshotRoutes(mux)
	}
}

// setupSnapshotRoutes registers the snapshot API routes against the
// Snapshots (metadata) bucket. Only called when Snapshots.Enabled is true.
// Services are owned by App.initServices / App.Dispose.
func (a *App) setupSnapshotRoutes(mux *http.ServeMux) {
	snapshotHandler := handlers.NewSnapshotHandler(
		a.snapshotService,
		a.couchbaseService,
		a.prometheusService,
		a.settings.DefaultDataSource,
		a.settings.Snapshots.Bucket,
	)

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
// CouchbaseDatasource.Enabled is true. Service is owned by App.initServices.
func (a *App) setupPrometheusRoutes(mux *http.ServeMux) {
	promQLHandler := handlers.NewPromQLHandler(a.couchbaseService)

	mux.HandleFunc("/query", promQLHandler.HandleQuery)
	mux.HandleFunc("/query_range", promQLHandler.HandleQueryRange)
	mux.HandleFunc("/series", promQLHandler.HandleSeries)

	log.Printf("PromQL Query API routes registered: /query, /query_range, /series")
}

// handleHealthCheckConnection probes the Couchbase buckets each enabled
// feature relies on (Snapshots metadata bucket + CouchbaseDatasource
// metrics bucket). Always responds HTTP 200; per-bucket state lives in
// the JSON body so the frontend can render distinct badges for
// "skipped because the feature is off" vs "actually broken".
func (a *App) handleHealthCheckConnection(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cb := a.settings.CouchbaseServer
	ctx, cancel := context.WithTimeout(req.Context(), 6*time.Second)
	defer cancel()

	resp := map[string]any{
		"snapshots":           a.probeBucket(ctx, cb, a.settings.Snapshots.Enabled, a.settings.Snapshots.Bucket, "snapshots feature disabled"),
		"couchbaseDatasource": a.probeBucket(ctx, cb, a.settings.CouchbaseDatasource.Enabled, a.settings.CouchbaseDatasource.Bucket, "couchbase datasource feature disabled"),
	}

	w.Header().Set("Content-Type", "application/json")
	if encErr := json.NewEncoder(w).Encode(resp); encErr != nil {
		log.Printf("[handleHealthCheckConnection] error encoding response: %v", encErr)
	}
}

// probeBucket returns a healthcheck sub-result for a single feature/bucket
// combination. The shape is intentionally compact — three mutually-exclusive
// states (`skipped`, `ok`, `error`) drive distinct UI affordances.
func (a *App) probeBucket(ctx context.Context, cb CouchbaseServerSettings, enabled bool, bucket, disabledReason string) map[string]any {
	if !enabled {
		return map[string]any{
			"skipped": true,
			"reason":  disabledReason,
		}
	}
	if cb.ConnectionString == "" {
		// Feature enabled but server settings missing — surface as error,
		// not skipped, so the user knows there's something to fix.
		return map[string]any{
			"skipped": false,
			"ok":      false,
			"bucket":  bucket,
			"error":   "couchbase server connection string is empty",
		}
	}

	start := time.Now()
	err := services.ProbeCouchbaseBucket(ctx, cb.ConnectionString, cb.Username, cb.Password, bucket, 5*time.Second)
	out := map[string]any{
		"skipped":          false,
		"ok":               err == nil,
		"bucket":           bucket,
		"connectionString": cb.ConnectionString,
		"latencyMs":        time.Since(start).Milliseconds(),
	}
	if err != nil {
		out["error"] = err.Error()
	}
	return out
}
