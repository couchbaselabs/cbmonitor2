package plugin

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/couchbase/monitor/pkg/handlers"
	"github.com/couchbase/monitor/pkg/services"
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

// getEnvWithDefault gets environment variable with a default value
func getEnvWithDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
