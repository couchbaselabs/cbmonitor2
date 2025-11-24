package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/couchbase/cbmonitor/pkg/promql"
	"github.com/couchbase/cbmonitor/pkg/services"
)

// PromQLHandler handles Prometheus Query API requests
// https://prometheus.io/docs/prometheus/latest/querying/api/
type PromQLHandler struct {
	couchbaseService *services.CouchbaseService
}

// NewPromQLHandler creates a new PromQL handler
func NewPromQLHandler(couchbaseService *services.CouchbaseService) *PromQLHandler {
	return &PromQLHandler{
		couchbaseService: couchbaseService,
	}
}

// HandleQuery handles GET /query (instant query)
func (h *PromQLHandler) HandleQuery(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse query parameters
	query := req.URL.Query().Get("query")
	if query == "" {
		h.sendErrorResponse(w, "query parameter is required", http.StatusBadRequest)
		return
	}

	timeStr := req.URL.Query().Get("time")
	if timeStr == "" {
		timeStr = fmt.Sprintf("%d", time.Now().Unix())
	}

	// Parse query context (snapshot will come from 'job' label in PromQL)
	queryCtx, err := promql.ParseQueryContext(query, timeStr, "", "", "", "")
	if err != nil {
		h.sendErrorResponse(w, fmt.Sprintf("Invalid query parameters: %v", err), http.StatusBadRequest)
		return
	}
	queryCtx.Context = req.Context()

	// Execute query
	result, err := h.executeQuery(queryCtx)
	if err != nil {
		log.Printf("Query execution error: %v", err)
		h.sendErrorResponse(w, fmt.Sprintf("Query execution failed: %v", err), http.StatusInternalServerError)
		return
	}

	// Send response
	h.sendJSONResponse(w, result, http.StatusOK)
}

// HandleQueryRange handles GET /query_range (range query)
func (h *PromQLHandler) HandleQueryRange(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse query parameters
	query := req.URL.Query().Get("query")
	if query == "" {
		h.sendErrorResponse(w, "query parameter is required", http.StatusBadRequest)
		return
	}

	startStr := req.URL.Query().Get("start")
	endStr := req.URL.Query().Get("end")
	stepStr := req.URL.Query().Get("step")

	if startStr == "" || endStr == "" {
		h.sendErrorResponse(w, "start and end parameters are required", http.StatusBadRequest)
		return
	}

	if stepStr == "" {
		stepStr = "15s" // Default step
	}

	// Parse query context (snapshot will come from 'job' label in PromQL)
	queryCtx, err := promql.ParseQueryContext(query, "", startStr, endStr, stepStr, "")
	if err != nil {
		h.sendErrorResponse(w, fmt.Sprintf("Invalid query parameters: %v", err), http.StatusBadRequest)
		return
	}
	queryCtx.Context = req.Context()

	// Execute query
	result, err := h.executeQuery(queryCtx)
	if err != nil {
		log.Printf("Query range execution error: %v", err)
		h.sendErrorResponse(w, fmt.Sprintf("Query execution failed: %v", err), http.StatusInternalServerError)
		return
	}

	// Send response
	h.sendJSONResponse(w, result, http.StatusOK)
}

// HandleSeries handles GET /api/v1/series (series discovery)
func (h *PromQLHandler) HandleSeries(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse query parameters
	match := req.URL.Query()["match[]"] // Can be multiple
	_ = req.URL.Query().Get("start") // TODO: Use for series discovery
	_ = req.URL.Query().Get("end")   // TODO: Use for series discovery

	if len(match) == 0 {
		h.sendErrorResponse(w, "match[] parameter is required", http.StatusBadRequest)
		return
	}

	// For now, return a simple response indicating series discovery is not fully implemented
	// This would require querying Couchbase metadata to discover available series
	result := promql.PrometheusResult{
		Status: "success",
		Data: promql.ResultData{
			ResultType: "series",
			Result:     []interface{}{},
		},
	}

	h.sendJSONResponse(w, result, http.StatusOK)
}

// executeQuery executes a PromQL query and returns Prometheus-formatted results
func (h *PromQLHandler) executeQuery(queryCtx *promql.QueryContext) (*promql.PrometheusResult, error) {
	// Parse PromQL query
	expr, err := promql.ParseQuery(queryCtx.Query)
	if err != nil {
		return nil, fmt.Errorf("failed to parse PromQL: %w", err)
	}

	// Create query plan (snapshot will be extracted from 'job' label in PromQL)
	plan, err := promql.PlanQuery(expr, "")
	if err != nil {
		return nil, fmt.Errorf("failed to plan query: %w", err)
	}

	log.Printf("Query plan: %s", plan.String())

	// Build SQL++ queries
	sqlBuilder := promql.NewSQLBuilder(plan, queryCtx)
	sqlQueries, err := sqlBuilder.Build()
	if err != nil {
		return nil, fmt.Errorf("failed to build SQL++ queries: %w", err)
	}

	log.Printf("Generated %d SQL++ queries", len(sqlQueries))

	// Execute queries against Couchbase
	var allResults []promql.QueryResult
	for i, sqlQuery := range sqlQueries {
		log.Printf("Executing query %d: %s", i+1, sqlQuery)

		results, err := h.couchbaseService.ExecuteQuery(queryCtx.Context, sqlQuery)
		if err != nil {
			log.Printf("Query execution error: %v", err)
			continue // Continue with other queries
		}

		// Convert results to QueryResult format
		for _, row := range results {
			queryResult := promql.QueryResult{
				Time:  getStringValue(row, "time"),
				Value: getValue(row, "value"),
			}

			// Extract labels if present
			if labels, ok := row["labels"].(map[string]interface{}); ok {
				queryResult.Labels = labels
			}

			allResults = append(allResults, queryResult)
		}
	}

	// Transform results to Prometheus format
	result, err := promql.TransformResults(allResults, plan, queryCtx)
	if err != nil {
		return nil, fmt.Errorf("failed to transform results: %w", err)
	}

	return result, nil
}

// Helper functions for extracting values from query results
func getStringValue(row map[string]interface{}, key string) string {
	if val, ok := row[key]; ok {
		if str, ok := val.(string); ok {
			return str
		}
		return fmt.Sprintf("%v", val)
	}
	return ""
}

func getValue(row map[string]interface{}, key string) interface{} {
	if val, ok := row[key]; ok {
		return val
	}
	return nil
}

// sendJSONResponse sends a JSON response
func (h *PromQLHandler) sendJSONResponse(w http.ResponseWriter, data interface{}, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

// sendErrorResponse sends an error response
func (h *PromQLHandler) sendErrorResponse(w http.ResponseWriter, message string, statusCode int) {
	response := promql.PrometheusResult{
		Status:    "error",
		Error:     message,
		ErrorType: "bad_data",
	}
	h.sendJSONResponse(w, response, statusCode)
}
