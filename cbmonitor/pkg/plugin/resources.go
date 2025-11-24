package plugin

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

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

// registerRoutes takes a *http.ServeMux and registers some HTTP handlers.
func (a *App) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/ping", a.handlePing)
	mux.HandleFunc("/echo", a.handleEcho)

	// Initialize Couchbase service and metrics handlers
	a.setupMetricsRoutes(mux)

	// Initialize snapshot routes
	a.setupSnapshotRoutes(mux)

	// Initialize Prometheus Query API routes
	a.setupPrometheusRoutes(mux)
}

// setupMetricsRoutes initializes the metrics API routes
func (a *App) setupMetricsRoutes(mux *http.ServeMux) {
	// Get Couchbase connection details from environment variables
	connectionString := getEnvWithDefault("COUCHBASE_CONNECTION_STRING", "couchbase://localhost")
	username := getEnvWithDefault("COUCHBASE_USERNAME", "Administrator")
	password := getEnvWithDefault("COUCHBASE_PASSWORD", "password")
	bucketName := getEnvWithDefault("COUCHBASE_BUCKET", "showfast")

	// Initialize Couchbase service
	couchbaseService, err := services.NewCouchbaseService(connectionString, username, password, bucketName)
	if err != nil {
		log.Printf("Warning: Failed to initialize Couchbase service: %v", err)
		log.Printf("Metrics endpoints will return mock data")
		// Continue without Couchbase - handlers will fall back to mock data
		couchbaseService = nil
	}

	// Initialize metrics handler
	metricsHandler := handlers.NewMetricsHandler(couchbaseService)

	// Register metrics routes
	mux.HandleFunc("/metrics/health", metricsHandler.HandleHealthCheck)
	mux.HandleFunc("/metrics/", func(w http.ResponseWriter, r *http.Request) {
		// Route to appropriate handler based on path structure
		pathParts := len(r.URL.Path)
		if pathParts > 20 { // Rough check for /metrics/{component}/{metric}
			metricsHandler.HandleGetMetricHistory(w, r)
		} else { // /metrics/{component}
			metricsHandler.HandleGetComponentMetrics(w, r)
		}
	})
}

// setupSnapshotRoutes initializes the snapshot API routes
func (a *App) setupSnapshotRoutes(mux *http.ServeMux) {
	// Get Couchbase connection details from environment variables
	connectionString := getEnvWithDefault("COUCHBASE_CONNECTION_STRING", "couchbase://localhost")
	username := getEnvWithDefault("COUCHBASE_USERNAME", "Administrator")
	password := getEnvWithDefault("COUCHBASE_PASSWORD", "password")
	snapshotBucket := getEnvWithDefault("COUCHBASE_SNAPSHOT_BUCKET", "metadata")

	// Initialize Snapshot service
	snapshotService, err := services.NewSnapshotService(connectionString, username, password, snapshotBucket)
	if err != nil {
		log.Printf("Warning: Failed to initialize Snapshot service: %v", err)
		log.Printf("Snapshot endpoints will not be available")
		snapshotService = nil
	}

	// Initialize Couchbase service for metric queries
	bucketName := getEnvWithDefault("COUCHBASE_BUCKET", "showfast")
	couchbaseService, err := services.NewCouchbaseService(connectionString, username, password, bucketName)
	if err != nil {
		log.Printf("Warning: Failed to initialize Couchbase service for snapshot metrics: %v", err)
		couchbaseService = nil
	}

	// Initialize snapshot handler
	snapshotHandler := handlers.NewSnapshotHandler(snapshotService, couchbaseService, snapshotBucket)

	// Register snapshot routes with nested path handling
	mux.HandleFunc("/snapshots/", func(w http.ResponseWriter, r *http.Request) {
		// Extract path after /snapshots/
		path := strings.TrimPrefix(r.URL.Path, "/snapshots/")
		pathParts := strings.Split(strings.Trim(path, "/"), "/")

		// Route based on path structure
		if len(pathParts) == 1 && pathParts[0] != "" {
			// /snapshots/{id}
			snapshotHandler.HandleGetSnapshot(w, r)
		} else if len(pathParts) >= 3 && pathParts[1] == "metrics" {
			// Handle metric-related paths
			if len(pathParts) == 3 {
				// /snapshots/{id}/metrics/{metric_name}
				snapshotHandler.HandleGetMetric(w, r)
			} else if len(pathParts) == 4 && pathParts[3] == "summary" {
				// /snapshots/{id}/metrics/{metric_name}/summary
				snapshotHandler.HandleGetMetricSummary(w, r)
			} else if len(pathParts) >= 5 && pathParts[3] == "phases" {
				if len(pathParts) == 5 {
					// /snapshots/{id}/metrics/{metric_name}/phases/{phase_name}
					snapshotHandler.HandleGetMetricPhase(w, r)
				} else if len(pathParts) == 6 && pathParts[5] == "summary" {
					// /snapshots/{id}/metrics/{metric_name}/phases/{phase_name}/summary
					snapshotHandler.HandleGetMetricPhaseSummary(w, r)
				} else {
					http.Error(w, "Invalid path", http.StatusBadRequest)
				}
			} else {
				http.Error(w, "Invalid path", http.StatusBadRequest)
			}
		} else if path == "" || path == "/" {
			// /snapshots/ or /snapshots
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		} else {
			// Unknown path
			http.Error(w, "Not found", http.StatusNotFound)
		}
	})

	log.Printf("Snapshot routes registered: /snapshots/{id}, /snapshots/{id}/metrics/{metric}, /snapshots/{id}/metrics/{metric}/phases/{phase}")
}

// setupPrometheusRoutes initializes the Prometheus Query API routes
func (a *App) setupPrometheusRoutes(mux *http.ServeMux) {
	// Get Couchbase connection details from environment variables
	connectionString := getEnvWithDefault("COUCHBASE_CONNECTION_STRING", "couchbase://localhost")
	username := getEnvWithDefault("COUCHBASE_USERNAME", "Administrator")
	password := getEnvWithDefault("COUCHBASE_PASSWORD", "password")
	bucketName := getEnvWithDefault("COUCHBASE_BUCKET", "showfast")

	// Initialize Couchbase service (reuse if already initialized)
	couchbaseService, err := services.NewCouchbaseService(connectionString, username, password, bucketName)
	if err != nil {
		log.Printf("Warning: Failed to initialize Couchbase service for Prometheus API: %v", err)
		log.Printf("Prometheus Query API endpoints will not be available")
		couchbaseService = nil
	}

	// Initialize PromQL handler
	promQLHandler := handlers.NewPromQLHandler(couchbaseService)

	// Register Prometheus Query API routes
	mux.HandleFunc("/query", promQLHandler.HandleQuery)
	mux.HandleFunc("/query_range", promQLHandler.HandleQueryRange)
	mux.HandleFunc("/series", promQLHandler.HandleSeries)

	log.Printf("PromQL Query API routes registered: /query, /query_range, /series")
}

// getEnvWithDefault gets environment variable with a default value
func getEnvWithDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
