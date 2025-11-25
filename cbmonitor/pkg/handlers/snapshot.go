package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
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

	// Parse label filters from query parameters
	labelFilters, _ := parseQueryParams(req)

	log.Printf("Fetching metric data: snapshot=%s, metric=%s, labelFilters=%v", snapshotID, metricName, labelFilters)

	if h.couchbaseService == nil {
		h.sendMetricErrorResponse(w, "Couchbase service is not available", http.StatusServiceUnavailable)
		return
	}

	// Build query using get_data_for_snapshot UDF (bucket name is hardcoded in UDF)
	// Select only time and value for debugging - clients only need raw data
	whereClause := buildLabelWhereClause(labelFilters)
	var query string
	if whereClause != "" {
		query = fmt.Sprintf(
			"SELECT time, `value` FROM get_data_for_snapshot('%s', '%s') AS d WHERE %s",
			metricName,
			snapshotID,
			whereClause,
		)
	} else {
		query = fmt.Sprintf(
			"SELECT time, `value` FROM get_data_for_snapshot('%s', '%s') AS data",
			metricName,
			snapshotID,
		)
	}

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

	// Parse label filters from query parameters
	labelFilters, _ := parseQueryParams(req)

	log.Printf("Fetching metric phase data: snapshot=%s, metric=%s, phase=%s, labelFilters=%v", snapshotID, metricName, phaseName, labelFilters)

	if h.couchbaseService == nil {
		h.sendMetricErrorResponse(w, "Couchbase service is not available", http.StatusServiceUnavailable)
		return
	}

	// Build query using get_data_for_phase UDF (bucket name is hardcoded in UDF)
	// Select only time and value for debugging - clients only need raw data
	whereClause := buildLabelWhereClause(labelFilters)
	var query string
	if whereClause != "" {
		query = fmt.Sprintf(
			"SELECT time, `value` FROM get_data_for_phase('%s', '%s', '%s') AS d WHERE %s",
			metricName,
			snapshotID,
			phaseName,
			whereClause,
		)
	} else {
		query = fmt.Sprintf(
			"SELECT time, `value` FROM get_data_for_phase('%s', '%s', '%s') AS data",
			metricName,
			snapshotID,
			phaseName,
		)
	}

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

// HandleGetMetricSummary handles GET /snapshots/{id}/metrics/{metric_name}/summary
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

	// Parse label filters and percentiles from query parameters
	labelFilters, percentiles := parseQueryParams(req)

	log.Printf("Computing metric summary: snapshot=%s, metric=%s, labelFilters=%v, percentiles=%v", snapshotID, metricName, labelFilters, percentiles)

	if h.couchbaseService == nil {
		h.sendSummaryErrorResponse(w, "Couchbase service is not available", http.StatusServiceUnavailable)
		return
	}

	// Build query using get_data_for_snapshot UDF to get all values
	whereClause := buildLabelWhereClause(labelFilters)
	var query string
	if whereClause != "" {
		query = fmt.Sprintf(
			"SELECT `value` FROM get_data_for_snapshot('%s', '%s') AS d WHERE %s",
			metricName,
			snapshotID,
			whereClause,
		)
	} else {
		query = fmt.Sprintf(
			"SELECT `value` FROM get_data_for_snapshot('%s', '%s') AS data",
			metricName,
			snapshotID,
		)
	}

	// Execute query
	results, err := h.couchbaseService.ExecuteQuery(req.Context(), query)
	if err != nil {
		log.Printf("Error executing metric summary query: %v", err)
		h.sendSummaryErrorResponse(w, fmt.Sprintf("Failed to fetch metric data: %v", err), http.StatusInternalServerError)
		return
	}

	// Extract values and compute summary with custom percentiles
	summary := h.computeSummary(results, percentiles)
	response := models.MetricSummaryResponse{
		Success:  true,
		Metric:   metricName,
		Snapshot: snapshotID,
		Summary:  summary,
	}
	h.sendJSONResponse(w, response, http.StatusOK)
}

// HandleGetMetricPhaseSummary handles GET /snapshots/{id}/metrics/{metric_name}/phases/{phase_name}/summary
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

	// Parse label filters and percentiles from query parameters
	labelFilters, percentiles := parseQueryParams(req)

	log.Printf("Computing metric phase summary: snapshot=%s, metric=%s, phase=%s, labelFilters=%v, percentiles=%v", snapshotID, metricName, phaseName, labelFilters, percentiles)

	if h.couchbaseService == nil {
		h.sendSummaryErrorResponse(w, "Couchbase service is not available", http.StatusServiceUnavailable)
		return
	}

	// Build query using get_data_for_phase UDF to get all values
	whereClause := buildLabelWhereClause(labelFilters)
	var query string
	if whereClause != "" {
		query = fmt.Sprintf(
			"SELECT `value` FROM get_data_for_phase('%s', '%s', '%s') AS d WHERE %s",
			metricName,
			snapshotID,
			phaseName,
			whereClause,
		)
	} else {
		query = fmt.Sprintf(
			"SELECT `value` FROM get_data_for_phase('%s', '%s', '%s') AS data",
			metricName,
			snapshotID,
			phaseName,
		)
	}

	// Execute query
	results, err := h.couchbaseService.ExecuteQuery(req.Context(), query)
	if err != nil {
		log.Printf("Error executing metric phase summary query: %v", err)
		h.sendSummaryErrorResponse(w, fmt.Sprintf("Failed to fetch metric phase data: %v", err), http.StatusInternalServerError)
		return
	}

	// Extract values and compute summary with custom percentiles
	summary := h.computeSummary(results, percentiles)
	response := models.MetricSummaryResponse{
		Success:  true,
		Metric:   metricName,
		Snapshot: snapshotID,
		Phase:    phaseName,
		Summary:  summary,
	}
	h.sendJSONResponse(w, response, http.StatusOK)
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

// formatPercentileKey formats a percentile value (0.0-1.0) as a string key
// Returns clean format like "0.5", "0.9", "0.99" (removes trailing zeros)
func formatPercentileKey(p float64) string {
	key := fmt.Sprintf("%.2f", p)
	// Remove trailing zeros for cleaner keys (e.g., "0.5" instead of "0.50")
	key = strings.TrimRight(strings.TrimRight(key, "0"), ".")
	return key
}

// computeSummary computes summary statistics from query results
// Always computes default percentiles (P50, P90, P99) and stores them in Percentiles map
// If customPercentiles are provided, they are added as extras to the Percentiles map
func (h *SnapshotHandler) computeSummary(results []map[string]interface{}, customPercentiles []float64) *models.MetricSummary {
	if len(results) == 0 {
		return &models.MetricSummary{
			Count:      0,
			Percentiles: make(map[string]float64),
		}
	}

	// Extract values from results
	var values []float64
	for _, row := range results {
		// Handle case where results might be wrapped in "data" key
		actualRow := row
		if data, ok := row["data"].(map[string]interface{}); ok {
			actualRow = data
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

		if valueFound {
			values = append(values, value)
		}
	}

	if len(values) == 0 {
		return &models.MetricSummary{
			Count:      0,
			Percentiles: make(map[string]float64),
		}
	}

	// Sort values for percentile computation
	sortedValues := make([]float64, len(values))
	copy(sortedValues, values)
	sort.Float64s(sortedValues)

	// Compute basic statistics
	count := len(sortedValues)
	var sum float64
	min := sortedValues[0]
	max := sortedValues[count-1]

	for _, v := range sortedValues {
		sum += v
	}

	avg := sum / float64(count)

	summary := &models.MetricSummary{
		Count:      count,
		Avg:        avg,
		Min:        min,
		Max:        max,
		Percentiles: make(map[string]float64),
	}

	// Always compute default percentiles: P50, P90, P99
	defaultPercentiles := []float64{0.50, 0.90, 0.99}
	for _, p := range defaultPercentiles {
		value := percentile(sortedValues, p)
		key := formatPercentileKey(p)
		summary.Percentiles[key] = value
	}

	// Add custom percentiles as extras (avoid duplicates)
	if len(customPercentiles) > 0 {
		for _, p := range customPercentiles {
			key := formatPercentileKey(p)
			// Only add if not already in map (avoid overwriting defaults)
			if _, exists := summary.Percentiles[key]; !exists {
				value := percentile(sortedValues, p)
				summary.Percentiles[key] = value
			}
		}
	}

	return summary
}

// percentile computes the percentile value from a sorted slice
// Uses linear interpolation between the two nearest ranks
func percentile(sortedValues []float64, p float64) float64 {
	if len(sortedValues) == 0 {
		return 0
	}
	if len(sortedValues) == 1 {
		return sortedValues[0]
	}

	// Calculate the position
	position := p * float64(len(sortedValues)-1)
	lower := int(position)
	upper := lower + 1
	weight := position - float64(lower)

	if upper >= len(sortedValues) {
		return sortedValues[len(sortedValues)-1]
	}

	// Linear interpolation
	return sortedValues[lower]*(1-weight) + sortedValues[upper]*weight
}

// getKeys returns all keys from a map for debugging
func getKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// Reserved parameter names that are NOT label filters
var reservedParams = map[string]bool{
	"percentiles": true,
	"p":           true, // short form
}

// parseQueryParams parses query parameters into label filters and percentiles
// Returns label filters map and list of percentile values (0.0-1.0)
func parseQueryParams(req *http.Request) (labelFilters map[string]string, percentiles []float64) {
	query := req.URL.Query()
	labelFilters = make(map[string]string)

	// First pass: extract percentiles
	if pStr := query.Get("percentiles"); pStr != "" {
		percentiles = parsePercentiles(pStr)
	} else if pStr := query.Get("p"); pStr != "" {
		percentiles = parsePercentiles(pStr)
	}

	// Second pass: everything else is a label filter
	for key, values := range query {
		if !reservedParams[strings.ToLower(key)] && len(values) > 0 {
			labelFilters[key] = values[0] // Take first value
		}
	}

	return labelFilters, percentiles
}

// parsePercentiles parses a comma-separated string of percentile values
// Returns a slice of float64 values in the range [0.0, 1.0]
func parsePercentiles(pStr string) []float64 {
	parts := strings.Split(pStr, ",")
	var percentiles []float64

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		// Parse as float
		p, err := strconv.ParseFloat(part, 64)
		if err != nil {
			log.Printf("Warning: Invalid percentile value '%s', skipping", part)
			continue
		}

		// Validate range [0.0, 1.0]
		if p < 0.0 || p > 1.0 {
			log.Printf("Warning: Percentile value %.2f out of range [0.0, 1.0], skipping", p)
			continue
		}

		percentiles = append(percentiles, p)
	}

	// Remove duplicates and sort
	if len(percentiles) > 0 {
		seen := make(map[float64]bool)
		unique := []float64{}
		for _, p := range percentiles {
			if !seen[p] {
				seen[p] = true
				unique = append(unique, p)
			}
		}
		sort.Float64s(unique)
		percentiles = unique
	}

	return percentiles
}

// escapeLabel escapes label names for SQL++ by wrapping them in backticks
func escapeLabel(label string) string {
	return fmt.Sprintf("`%s`", label)
}

// buildLabelWhereClause builds a WHERE clause for label filters
// Returns empty string if no filters, otherwise returns conditions joined with AND
func buildLabelWhereClause(labelFilters map[string]string) string {
	if len(labelFilters) == 0 {
		return ""
	}

	conditions := []string{}
	for labelName, labelValue := range labelFilters {
		// Escape label name and value for SQL injection prevention
		escapedLabel := escapeLabel(labelName)
		// Basic SQL injection prevention - escape single quotes in value
		escapedValue := strings.ReplaceAll(labelValue, "'", "''")
		conditions = append(conditions, fmt.Sprintf(`d.labels.%s = '%s'`, escapedLabel, escapedValue))
	}

	return strings.Join(conditions, " AND ")
}
