package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/couchbase/cbmonitor/pkg/models"
	"github.com/couchbase/cbmonitor/pkg/services"
)

// MetricsHandler handles all metrics-related HTTP requests
type MetricsHandler struct {
	couchbaseService *services.CouchbaseService
}

// NewMetricsHandler creates a new metrics handler
func NewMetricsHandler(couchbaseService *services.CouchbaseService) *MetricsHandler {
	return &MetricsHandler{
		couchbaseService: couchbaseService,
	}
}

// HandleGetComponentMetrics handles GET /metrics/{componentId}
func (h *MetricsHandler) HandleGetComponentMetrics(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract component ID from URL path
	pathParts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")
	if len(pathParts) < 2 {
		h.sendErrorResponse(w, "Component ID is required", http.StatusBadRequest)
		return
	}
	
	componentID := pathParts[1] // /metrics/{componentId}

	// Get query parameters for filtering (optional)
	category := req.URL.Query().Get("category")
	subCategory := req.URL.Query().Get("subCategory")

	log.Printf("Fetching metrics for component: %s, category: %s, subCategory: %s", 
		componentID, category, subCategory)

	// Fetch metrics from Couchbase
	var metricDocs []models.MetricDocument
	var err error

	if category != "" && subCategory != "" {
		// Use your specific query with filters
		metricDocs, err = h.couchbaseService.GetMetricsByComponent(req.Context(), componentID, category, subCategory)
	} else {
		// Get all metrics for the component
		metricDocs, err = h.couchbaseService.GetAllMetricsForComponent(req.Context(), componentID)
	}

	if err != nil {
		log.Printf("Error fetching metrics: %v", err)
		h.sendErrorResponse(w, fmt.Sprintf("Failed to fetch metrics: %v", err), http.StatusInternalServerError)
		return
	}

	// Convert to API response format
	componentMetrics, err := h.couchbaseService.ConvertToComponentMetrics(req.Context(), componentID, metricDocs)
	if err != nil {
		log.Printf("Error converting metrics: %v", err)
		h.sendErrorResponse(w, fmt.Sprintf("Failed to process metrics: %v", err), http.StatusInternalServerError)
		return
	}

	// Send success response
	response := models.MetricsResponse{
		Success: true,
		Data:    *componentMetrics,
	}

	h.sendJSONResponse(w, response, http.StatusOK)
	log.Printf("Successfully returned %d metrics for component: %s", len(componentMetrics.Metrics), componentID)
}

// HandleGetMetricHistory handles GET /metrics/{componentId}/{metricId}
func (h *MetricsHandler) HandleGetMetricHistory(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract component ID and metric ID from URL path
	pathParts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")
	if len(pathParts) < 3 {
		h.sendErrorResponse(w, "Component ID and Metric ID are required", http.StatusBadRequest)
		return
	}
	
	componentID := pathParts[1] // /metrics/{componentId}/{metricId}
	metricID := pathParts[2]

	// Get limit parameter
	limit := 50 // default
	if limitStr := req.URL.Query().Get("limit"); limitStr != "" {
		if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}

	log.Printf("Fetching metric history for component: %s, metric: %s, limit: %d", 
		componentID, metricID, limit)

	// Fetch metric values from Couchbase
	values, err := h.couchbaseService.GetMetricValues(req.Context(), metricID, limit)
	if err != nil {
		log.Printf("Error fetching metric values: %v", err)
		h.sendErrorResponse(w, fmt.Sprintf("Failed to fetch metric values: %v", err), http.StatusInternalServerError)
		return
	}

	// Create metric response
	metric := models.Metric{
		ID:          metricID,
		Name:        metricID, // You might want to fetch the actual name from the metrics table
		Description: fmt.Sprintf("Historical data for %s", metricID),
		Unit:        "value", // You might want to determine this based on the metric
		Category:    "general",
		Values:      values,
	}

	h.sendJSONResponse(w, metric, http.StatusOK)
	log.Printf("Successfully returned %d values for metric: %s", len(values), metricID)
}

// HandleHealthCheck handles GET /health
func (h *MetricsHandler) HandleHealthCheck(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	response := map[string]interface{}{
		"status":  "ok",
		"message": "Metrics service is healthy",
		"service": "cbmonitor-metrics",
	}

	h.sendJSONResponse(w, response, http.StatusOK)
}

// sendJSONResponse sends a JSON response
func (h *MetricsHandler) sendJSONResponse(w http.ResponseWriter, data interface{}, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*") // Enable CORS for frontend
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	
	w.WriteHeader(statusCode)
	
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

// sendErrorResponse sends an error response
func (h *MetricsHandler) sendErrorResponse(w http.ResponseWriter, message string, statusCode int) {
	response := models.MetricsResponse{
		Success: false,
		Error:   message,
	}
	h.sendJSONResponse(w, response, statusCode)
}
