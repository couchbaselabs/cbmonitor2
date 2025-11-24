package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/couchbase/cbmonitor/pkg/models"
	"github.com/couchbase/cbmonitor/pkg/services"
)

// SnapshotHandler handles all snapshot-related HTTP requests
type SnapshotHandler struct {
	snapshotService *services.SnapshotService
	couchbaseService *services.CouchbaseService
	snapshotBucket   string
}

// NewSnapshotHandler creates a new snapshot handler
func NewSnapshotHandler(snapshotService *services.SnapshotService, couchbaseService *services.CouchbaseService, snapshotBucket string) *SnapshotHandler {
	return &SnapshotHandler{
		snapshotService:  snapshotService,
		couchbaseService: couchbaseService,
		snapshotBucket:   snapshotBucket,
	}
}

// HandleGetSnapshot handles GET /snapshots/{snapshotId}
func (h *SnapshotHandler) HandleGetSnapshot(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract snapshot ID from URL path
	pathParts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")
	if len(pathParts) < 2 {
		h.sendErrorResponse(w, "Snapshot ID is required", http.StatusBadRequest)
		return
	}

	snapshotID := pathParts[1] // /snapshots/{snapshotId}

	log.Printf("Fetching snapshot: %s", snapshotID)

	// Check if service is available
	if h.snapshotService == nil {
		h.sendErrorResponse(w, "Snapshot service is not available", http.StatusServiceUnavailable)
		return
	}

	// Fetch snapshot from Couchbase
	snapshotData, err := h.snapshotService.GetSnapshotByID(req.Context(), snapshotID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			log.Printf("Snapshot not found: %s", snapshotID)
			h.sendErrorResponse(w, fmt.Sprintf("Snapshot not found: %s", snapshotID), http.StatusNotFound)
		} else {
			log.Printf("Error fetching snapshot: %v", err)
			h.sendErrorResponse(w, fmt.Sprintf("Failed to fetch snapshot: %v", err), http.StatusInternalServerError)
		}
		return
	}

	// Send success response
	response := models.SnapshotResponse{
		Success: true,
		Data:    *snapshotData,
	}

	h.sendJSONResponse(w, response, http.StatusOK)
	log.Printf("Successfully returned snapshot: %s with %d services", 
		snapshotID, len(snapshotData.Metadata.Services))
}

// sendJSONResponse sends a JSON response
func (h *SnapshotHandler) sendJSONResponse(w http.ResponseWriter, data interface{}, statusCode int) {
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
func (h *SnapshotHandler) sendErrorResponse(w http.ResponseWriter, message string, statusCode int) {
	response := models.SnapshotResponse{
		Success: false,
		Error:   message,
	}
	h.sendJSONResponse(w, response, statusCode)
}

// HandleGetMetric handles GET /snapshots/{id}/metrics/{metric_name}
func (h *SnapshotHandler) HandleGetMetric(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract snapshot ID and metric name from URL path
	pathParts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")
	if len(pathParts) < 4 || pathParts[0] != "snapshots" || pathParts[2] != "metrics" {
		h.sendMetricErrorResponse(w, "Invalid path. Expected: /snapshots/{id}/metrics/{metric_name}", http.StatusBadRequest)
		return
	}

	snapshotID := pathParts[1]
	metricName := pathParts[3]

	log.Printf("Fetching metric data: snapshot=%s, metric=%s", snapshotID, metricName)

	if h.couchbaseService == nil {
		h.sendMetricErrorResponse(w, "Couchbase service is not available", http.StatusServiceUnavailable)
		return
	}

	// Build query using get_data_for_snapshot UDF (bucket name is hardcoded in UDF)
	// Select only time and value for debugging - clients only need raw data
	query := fmt.Sprintf(
		"SELECT time, `value` FROM get_data_for_snapshot('%s', '%s') AS data",
		metricName,
		snapshotID,
	)

	// Execute query
	results, err := h.couchbaseService.ExecuteQuery(req.Context(), query)
	if err != nil {
		log.Printf("Error executing metric query: %v", err)
		h.sendMetricErrorResponse(w, fmt.Sprintf("Failed to fetch metric data: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("Query returned %d results", len(results))
	if len(results) > 0 {
		log.Printf("First result sample: %+v", results[0])
	}

	// Transform results
	response := h.transformMetricResults(results, snapshotID, metricName, nil)
	h.sendJSONResponse(w, response, http.StatusOK)
}

// HandleGetMetricPhase handles GET /snapshots/{id}/metrics/{metric_name}/phases/{phase_name}
func (h *SnapshotHandler) HandleGetMetricPhase(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract snapshot ID, metric name, and phase name from URL path
	pathParts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")
	if len(pathParts) < 6 || pathParts[0] != "snapshots" || pathParts[2] != "metrics" || pathParts[4] != "phases" {
		h.sendMetricErrorResponse(w, "Invalid path. Expected: /snapshots/{id}/metrics/{metric_name}/phases/{phase_name}", http.StatusBadRequest)
		return
	}

	snapshotID := pathParts[1]
	metricName := pathParts[3]
	phaseName := pathParts[5]

	log.Printf("Fetching metric phase data: snapshot=%s, metric=%s, phase=%s", snapshotID, metricName, phaseName)

	if h.couchbaseService == nil {
		h.sendMetricErrorResponse(w, "Couchbase service is not available", http.StatusServiceUnavailable)
		return
	}

	// Build query using get_data_for_phase UDF (bucket name is hardcoded in UDF)
	// Select only time and value for debugging - clients only need raw data
	query := fmt.Sprintf(
		"SELECT time, `value` FROM get_data_for_phase('%s', '%s', '%s') AS data",
		metricName,
		snapshotID,
		phaseName,
	)

	// Execute query
	results, err := h.couchbaseService.ExecuteQuery(req.Context(), query)
	if err != nil {
		log.Printf("Error executing metric phase query: %v", err)
		h.sendMetricErrorResponse(w, fmt.Sprintf("Failed to fetch metric phase data: %v", err), http.StatusInternalServerError)
		return
	}

	// Transform results
	response := h.transformMetricResults(results, snapshotID, metricName, &phaseName)
	h.sendJSONResponse(w, response, http.StatusOK)
}

// HandleGetMetricSummary handles GET /snapshots/{id}/metrics/{metric_name}/summary (future)
func (h *SnapshotHandler) HandleGetMetricSummary(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract snapshot ID and metric name from URL path
	pathParts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")
	if len(pathParts) < 5 || pathParts[0] != "snapshots" || pathParts[2] != "metrics" || pathParts[4] != "summary" {
		h.sendSummaryErrorResponse(w, "Invalid path. Expected: /snapshots/{id}/metrics/{metric_name}/summary", http.StatusBadRequest)
		return
	}

	snapshotID := pathParts[1]
	metricName := pathParts[3]

	// TODO: Implement summary computation
	response := models.MetricSummaryResponse{
		Success:  false,
		Metric:   metricName,
		Snapshot: snapshotID,
		Error:    "Summary computation not yet implemented",
	}
	h.sendJSONResponse(w, response, http.StatusNotImplemented)
}

// HandleGetMetricPhaseSummary handles GET /snapshots/{id}/metrics/{metric_name}/phases/{phase_name}/summary (future)
func (h *SnapshotHandler) HandleGetMetricPhaseSummary(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract snapshot ID, metric name, and phase name from URL path
	pathParts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")
	if len(pathParts) < 7 || pathParts[0] != "snapshots" || pathParts[2] != "metrics" || pathParts[4] != "phases" || pathParts[6] != "summary" {
		h.sendSummaryErrorResponse(w, "Invalid path. Expected: /snapshots/{id}/metrics/{metric_name}/phases/{phase_name}/summary", http.StatusBadRequest)
		return
	}

	snapshotID := pathParts[1]
	metricName := pathParts[3]
	phaseName := pathParts[5]

	// TODO: Implement summary computation
	response := models.MetricSummaryResponse{
		Success:  false,
		Metric:   metricName,
		Snapshot: snapshotID,
		Phase:    phaseName,
		Error:    "Summary computation not yet implemented",
	}
	h.sendJSONResponse(w, response, http.StatusNotImplemented)
}

// transformMetricResults transforms Couchbase query results to MetricDataResponse
// Simplified for debugging - only returns time and value pairs
func (h *SnapshotHandler) transformMetricResults(results []map[string]interface{}, snapshotID, metricName string, phaseName *string) models.MetricDataResponse {
	// For debugging APIs, we just return a flat list of time-value pairs
	// No need to group by labels - clients only care about raw data
	var dataPoints []models.MetricDataPoint

	for _, row := range results {
		// Handle case where results might be wrapped in "data" key
		actualRow := row
		if data, ok := row["data"].(map[string]interface{}); ok {
			actualRow = data
		}

		// Extract time
		timeStr, ok := actualRow["time"].(string)
		if !ok {
			log.Printf("Warning: Missing or invalid 'time' field in result: %+v", actualRow)
			continue
		}

		// Extract value - try different types
		var value float64
		valueFound := false

		if v, ok := actualRow["value"].(float64); ok {
			value = v
			valueFound = true
		} else if v, ok := actualRow["value"].(int); ok {
			value = float64(v)
			valueFound = true
		} else if v, ok := actualRow["value"].(int64); ok {
			value = float64(v)
			valueFound = true
		}

		if !valueFound {
			log.Printf("Warning: Missing or invalid 'value' field. Available fields: %v", getKeys(actualRow))
			continue
		}

		// Add data point (no labels for debugging API)
		dataPoints = append(dataPoints, models.MetricDataPoint{
			Time:  timeStr,
			Value: value,
		})
	}

	response := models.MetricDataResponse{
		Success:  true,
		Metric:   metricName,
		Snapshot: snapshotID,
		Values:   dataPoints,
		Count:    len(dataPoints),
	}

	return response
}

// buildLabelKey creates a unique key for a label set
func (h *SnapshotHandler) buildLabelKey(labels map[string]interface{}) string {
	if len(labels) == 0 {
		return "{}"
	}

	var parts []string
	for k, v := range labels {
		parts = append(parts, fmt.Sprintf("%s=%v", k, v))
	}
	// Sort for consistent ordering
	for i := 0; i < len(parts)-1; i++ {
		for j := i + 1; j < len(parts); j++ {
			if parts[i] > parts[j] {
				parts[i], parts[j] = parts[j], parts[i]
			}
		}
	}
	return "{" + strings.Join(parts, ",") + "}"
}

// sendMetricErrorResponse sends an error response for metric endpoints
func (h *SnapshotHandler) sendMetricErrorResponse(w http.ResponseWriter, message string, statusCode int) {
	response := models.MetricDataResponse{
		Success: false,
		Error:   message,
	}
	h.sendJSONResponse(w, response, statusCode)
}

// sendSummaryErrorResponse sends an error response for summary endpoints
func (h *SnapshotHandler) sendSummaryErrorResponse(w http.ResponseWriter, message string, statusCode int) {
	response := models.MetricSummaryResponse{
		Success: false,
		Error:   message,
	}
	h.sendJSONResponse(w, response, statusCode)
}

// getKeys returns all keys from a map for debugging
func getKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
