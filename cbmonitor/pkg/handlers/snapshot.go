package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/couchbase/cbmonitor/pkg/models"
	"github.com/couchbase/cbmonitor/pkg/promqlbuilder"
	"github.com/couchbase/cbmonitor/pkg/services"
)

// metricSource is the per-backend fetcher used by the snapshot metric handlers.
// Two implementations exist: one against Couchbase and one against a Prometheus-compatible HTTP API.
// The handler picks one per request based on plugin settings; the choice is transparent to callers.
type metricSource interface {
	Fetch(ctx context.Context, req metricRequest) ([]models.MetricDataPoint, error)
}

// metricRequest carries everything either backend needs.
type metricRequest struct {
	Metric, SnapshotID string
	PhaseName          string
	LabelFilters       map[string]string
	Start, End         time.Time
	Step               time.Duration
}

// metricSourceUnavailableError signals the active backend isn't wired up.
// Surfaced as HTTP 503 by the handler.
type metricSourceUnavailableError struct{ msg string }

func (e *metricSourceUnavailableError) Error() string { return e.msg }

func errMetricSourceUnavailable(msg string) error { return &metricSourceUnavailableError{msg: msg} }

// snapshotFetcher captures the slice of SnapshotService the handler
// uses, so tests can inject a stub without standing up Couchbase.
type snapshotFetcher interface {
	GetSnapshotByID(ctx context.Context, snapshotID string) (*models.SnapshotData, error)
}

// SnapshotHandler handles all snapshot-related HTTP requests
type SnapshotHandler struct {
	snapshotService   snapshotFetcher
	couchbaseService  *services.CouchbaseService
	prometheusService *services.PrometheusService
	defaultDataSource func() string
	snapshotBucket    string

	couchbaseSource  metricSource
	prometheusSource metricSource
}

// NewSnapshotHandler creates a new snapshot handler. defaultDataSource
// is read at request time so an admin toggling the active backend in
// plugin settings takes effect on the next call without a restart.
// Either backend service may be nil — handlers will respond with 503
// when the configured-default backend isn't available.
func NewSnapshotHandler(
	snapshotService *services.SnapshotService,
	couchbaseService *services.CouchbaseService,
	prometheusService *services.PrometheusService,
	defaultDataSource func() string,
	snapshotBucket string,
) *SnapshotHandler {
	if defaultDataSource == nil {
		defaultDataSource = func() string { return "couchbase" }
	}
	// Convert the concrete pointer to a typed-nil-safe interface so
	// downstream `if x == nil` checks work as expected.
	var sf snapshotFetcher
	if snapshotService != nil {
		sf = snapshotService
	}
	return &SnapshotHandler{
		snapshotService:   sf,
		couchbaseService:  couchbaseService,
		prometheusService: prometheusService,
		defaultDataSource: defaultDataSource,
		snapshotBucket:    snapshotBucket,
		couchbaseSource: &couchbaseMetricSource{
			couchbase:       couchbaseService,
			snapshotService: sf,
		},
		prometheusSource: &prometheusMetricSource{
			prometheus: prometheusService,
		},
	}
}

// pickSource returns the per-request backend chosen by plugin settings.
// "prometheus" → Mimir-backed source; anything else → Couchbase.
func (h *SnapshotHandler) pickSource() (metricSource, string) {
	if h.defaultDataSource() == "prometheus" {
		return h.prometheusSource, "prometheus"
	}
	return h.couchbaseSource, "couchbase"
}

// HandleGetSnapshot handles GET /snapshots/{snapshotId}
func (h *SnapshotHandler) HandleGetSnapshot(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	pathParts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")
	if len(pathParts) < 2 {
		h.sendErrorResponse(w, "Snapshot ID is required", http.StatusBadRequest)
		return
	}

	snapshotID := pathParts[1]
	log.Printf("Fetching snapshot: %s", snapshotID)

	if h.snapshotService == nil {
		h.sendErrorResponse(w, "Snapshot service is not available", http.StatusServiceUnavailable)
		return
	}

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

	h.sendJSONResponse(w, models.SnapshotResponse{Success: true, Data: *snapshotData}, http.StatusOK)
	log.Printf("Successfully returned snapshot: %s with %d services",
		snapshotID, len(snapshotData.Metadata.Services))
}

// HandleGetMetric handles GET /snapshots/{id}/metrics/{metric_name}
func (h *SnapshotHandler) HandleGetMetric(w http.ResponseWriter, req *http.Request) {
	h.handleMetric(w, req, "")
}

// HandleGetMetricPhase handles GET /snapshots/{id}/metrics/{metric_name}/phases/{phase_name}
func (h *SnapshotHandler) HandleGetMetricPhase(w http.ResponseWriter, req *http.Request) {
	parts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")
	if len(parts) < 6 {
		h.sendMetricErrorResponse(w, "Invalid path. Expected: /snapshots/{id}/metrics/{metric_name}/phases/{phase_name}", http.StatusBadRequest)
		return
	}
	h.handleMetric(w, req, parts[5])
}

// HandleGetMetricSummary handles GET /snapshots/{id}/metrics/{metric_name}/summary
func (h *SnapshotHandler) HandleGetMetricSummary(w http.ResponseWriter, req *http.Request) {
	h.handleSummary(w, req, "")
}

// HandleGetMetricPhaseSummary handles GET /snapshots/{id}/metrics/{metric_name}/phases/{phase_name}/summary
func (h *SnapshotHandler) HandleGetMetricPhaseSummary(w http.ResponseWriter, req *http.Request) {
	parts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")
	if len(parts) < 7 {
		h.sendSummaryErrorResponse(w, "Invalid path. Expected: /snapshots/{id}/metrics/{metric_name}/phases/{phase_name}/summary", http.StatusBadRequest)
		return
	}
	h.handleSummary(w, req, parts[5])
}

// handleMetric services both the full-snapshot and phase variants of
// the raw-data endpoint. phaseName is "" for the full-snapshot path.
func (h *SnapshotHandler) handleMetric(w http.ResponseWriter, req *http.Request, phaseName string) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")
	if len(parts) < 4 || parts[0] != "snapshots" || parts[2] != "metrics" {
		h.sendMetricErrorResponse(w, "Invalid path", http.StatusBadRequest)
		return
	}
	snapshotID := parts[1]
	metricName := parts[3]

	mr, status, err := h.buildMetricRequest(req, snapshotID, metricName, phaseName)
	if err != nil {
		h.sendMetricErrorResponse(w, err.Error(), status)
		return
	}

	source, sourceName := h.pickSource()
	log.Printf("Fetching metric data via %s: snapshot=%s, metric=%s, phase=%q, labelFilters=%v",
		sourceName, mr.SnapshotID, mr.Metric, mr.PhaseName, mr.LabelFilters)

	points, err := source.Fetch(req.Context(), mr)
	if err != nil {
		statusCode := http.StatusInternalServerError
		var unavail *metricSourceUnavailableError
		if errors.As(err, &unavail) {
			statusCode = http.StatusServiceUnavailable
		}
		log.Printf("metric fetch error: %v", err)
		h.sendMetricErrorResponse(w, err.Error(), statusCode)
		return
	}

	h.sendJSONResponse(w, models.MetricDataResponse{
		Success:  true,
		Metric:   metricName,
		Snapshot: snapshotID,
		Values:   points,
		Count:    len(points),
	}, http.StatusOK)
}

// handleSummary services the summary variants. Identical request
// pipeline as handleMetric; only the response shape differs.
func (h *SnapshotHandler) handleSummary(w http.ResponseWriter, req *http.Request, phaseName string) {
	if req.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")
	if len(parts) < 5 || parts[0] != "snapshots" || parts[2] != "metrics" {
		h.sendSummaryErrorResponse(w, "Invalid path", http.StatusBadRequest)
		return
	}
	snapshotID := parts[1]
	metricName := parts[3]

	mr, status, err := h.buildMetricRequest(req, snapshotID, metricName, phaseName)
	if err != nil {
		h.sendSummaryErrorResponse(w, err.Error(), status)
		return
	}

	_, percentiles := parseQueryParams(req)

	source, sourceName := h.pickSource()
	log.Printf("Computing metric summary via %s: snapshot=%s, metric=%s, phase=%q, percentiles=%v",
		sourceName, mr.SnapshotID, mr.Metric, mr.PhaseName, percentiles)

	points, err := source.Fetch(req.Context(), mr)
	if err != nil {
		statusCode := http.StatusInternalServerError
		var unavail *metricSourceUnavailableError
		if errors.As(err, &unavail) {
			statusCode = http.StatusServiceUnavailable
		}
		log.Printf("metric summary fetch error: %v", err)
		h.sendSummaryErrorResponse(w, err.Error(), statusCode)
		return
	}

	summary := computeSummary(pointValues(points), percentiles)
	resp := models.MetricSummaryResponse{
		Success:  true,
		Metric:   metricName,
		Snapshot: snapshotID,
		Summary:  summary,
	}
	if phaseName != "" {
		resp.Phase = phaseName
	}
	h.sendJSONResponse(w, resp, http.StatusOK)
}

// buildMetricRequest parses query params and (when the active source
// is Prometheus) resolves the snapshot/phase time window. Returns the
// completed metricRequest, or an HTTP status + error on bad input.
func (h *SnapshotHandler) buildMetricRequest(req *http.Request, snapshotID, metricName, phaseName string) (metricRequest, int, error) {
	labelFilters, _ := parseQueryParams(req)

	mr := metricRequest{
		Metric:       metricName,
		SnapshotID:   snapshotID,
		PhaseName:    phaseName,
		LabelFilters: labelFilters,
	}

	if h.defaultDataSource() != "prometheus" {
		return mr, http.StatusOK, nil
	}

	// Prometheus path: explicitly resolve the time window and parse
	// the optional ?step= query parameter.
	step := promqlbuilder.DefaultStep
	if stepStr := req.URL.Query().Get("step"); stepStr != "" {
		parsed, err := promqlbuilder.ParseStep(stepStr)
		if err != nil {
			return metricRequest{}, http.StatusBadRequest, err
		}
		step = parsed
	}
	mr.Step = step

	start, end, status, err := h.resolveTimeRange(req.Context(), snapshotID, phaseName)
	if err != nil {
		return metricRequest{}, status, err
	}
	mr.Start = start
	mr.End = end
	return mr, http.StatusOK, nil
}

// resolveTimeRange fetches snapshot metadata and returns the relevant
// time window. For the full-snapshot path it returns the metadata's
// ts_start/ts_end. For a phase request it returns that phase's
// ts_start/ts_end if the phase exists; otherwise the snapshot window
// (matching the Couchbase path's "no rows" behaviour for unknown
// phases, but giving Mimir a valid range to query).
func (h *SnapshotHandler) resolveTimeRange(ctx context.Context, snapshotID, phaseName string) (time.Time, time.Time, int, error) {
	if h.snapshotService == nil {
		return time.Time{}, time.Time{}, http.StatusServiceUnavailable,
			fmt.Errorf("snapshot service is not available")
	}
	snapshotData, err := h.snapshotService.GetSnapshotByID(ctx, snapshotID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return time.Time{}, time.Time{}, http.StatusNotFound, fmt.Errorf("snapshot not found: %s", snapshotID)
		}
		return time.Time{}, time.Time{}, http.StatusInternalServerError, fmt.Errorf("fetch snapshot metadata: %w", err)
	}

	start, end, ok := parseSnapshotWindow(snapshotData.Metadata.TSStart, snapshotData.Metadata.TSEnd)
	if !ok {
		return time.Time{}, time.Time{}, http.StatusInternalServerError,
			fmt.Errorf("snapshot %s has invalid ts_start/ts_end", snapshotID)
	}

	if phaseName == "" {
		return start, end, http.StatusOK, nil
	}

	for _, phase := range snapshotData.Metadata.Phases {
		if phase.Label == phaseName {
			pStart, pEnd, ok := parseSnapshotWindow(phase.TSStart, phase.TSEnd)
			if !ok {
				return time.Time{}, time.Time{}, http.StatusInternalServerError,
					fmt.Errorf("phase %q has invalid ts_start/ts_end", phaseName)
			}
			return pStart, pEnd, http.StatusOK, nil
		}
	}

	// Unknown phase: fall back to the full snapshot window so the
	// caller gets an empty result rather than an error.
	log.Printf("phase %q not found in snapshot %s metadata; using full snapshot window", phaseName, snapshotID)
	return start, end, http.StatusOK, nil
}

// parseSnapshotWindow accepts the ISO timestamps from snapshot metadata.
// Returns ok=false on unparsable input. Tries RFC3339 first, then a
// looser layout with no zone (defaulting to UTC) for tolerance.
func parseSnapshotWindow(startStr, endStr string) (time.Time, time.Time, bool) {
	layouts := []string{time.RFC3339, time.RFC3339Nano, "2006-01-02T15:04:05"}
	parse := func(s string) (time.Time, bool) {
		for _, layout := range layouts {
			if t, err := time.Parse(layout, s); err == nil {
				return t, true
			}
		}
		return time.Time{}, false
	}
	start, ok1 := parse(startStr)
	end, ok2 := parse(endStr)
	if !ok1 || !ok2 {
		return time.Time{}, time.Time{}, false
	}
	return start, end, true
}

// sendJSONResponse sends a JSON response
func (h *SnapshotHandler) sendJSONResponse(w http.ResponseWriter, data interface{}, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

func (h *SnapshotHandler) sendErrorResponse(w http.ResponseWriter, message string, statusCode int) {
	h.sendJSONResponse(w, models.SnapshotResponse{Success: false, Error: message}, statusCode)
}

func (h *SnapshotHandler) sendMetricErrorResponse(w http.ResponseWriter, message string, statusCode int) {
	h.sendJSONResponse(w, models.MetricDataResponse{Success: false, Error: message}, statusCode)
}

func (h *SnapshotHandler) sendSummaryErrorResponse(w http.ResponseWriter, message string, statusCode int) {
	h.sendJSONResponse(w, models.MetricSummaryResponse{Success: false, Error: message}, statusCode)
}

// formatPercentileKey renders a percentile fraction as a map key.
// Trailing zeros are stripped so 0.50 → "0.5", 0.99 → "0.99".
func formatPercentileKey(p float64) string {
	key := fmt.Sprintf("%.2f", p)
	key = strings.TrimRight(strings.TrimRight(key, "0"), ".")
	return key
}

// computeSummary computes summary statistics from a slice of values.
// The defaults (0.5, 0.9, 0.99) are always emitted; any custom
// percentiles are merged into the same map.
func computeSummary(values []float64, customPercentiles []float64) *models.MetricSummary {
	if len(values) == 0 {
		return &models.MetricSummary{
			Count:       0,
			Percentiles: make(map[string]float64),
		}
	}

	sortedValues := make([]float64, len(values))
	copy(sortedValues, values)
	sort.Float64s(sortedValues)

	count := len(sortedValues)
	var sum float64
	min := sortedValues[0]
	max := sortedValues[count-1]
	for _, v := range sortedValues {
		sum += v
	}
	avg := sum / float64(count)

	summary := &models.MetricSummary{
		Count:       count,
		Avg:         avg,
		Min:         min,
		Max:         max,
		Percentiles: make(map[string]float64),
	}

	for _, p := range []float64{0.50, 0.90, 0.99} {
		summary.Percentiles[formatPercentileKey(p)] = percentile(sortedValues, p)
	}
	for _, p := range customPercentiles {
		key := formatPercentileKey(p)
		if _, exists := summary.Percentiles[key]; !exists {
			summary.Percentiles[key] = percentile(sortedValues, p)
		}
	}
	return summary
}

// pointValues extracts the numeric values from a slice of data points
// in their input order. computeSummary sorts internally; no need to
// pre-sort.
func pointValues(points []models.MetricDataPoint) []float64 {
	values := make([]float64, 0, len(points))
	for _, p := range points {
		values = append(values, p.Value)
	}
	return values
}

// percentile computes the percentile value from a sorted slice via
// linear interpolation between the two nearest ranks.
func percentile(sortedValues []float64, p float64) float64 {
	if len(sortedValues) == 0 {
		return 0
	}
	if len(sortedValues) == 1 {
		return sortedValues[0]
	}

	position := p * float64(len(sortedValues)-1)
	lower := int(position)
	upper := lower + 1
	weight := position - float64(lower)

	if upper >= len(sortedValues) {
		return sortedValues[len(sortedValues)-1]
	}
	return sortedValues[lower]*(1-weight) + sortedValues[upper]*weight
}

// reservedParams are query-string keys that are NOT treated as label
// filters by parseQueryParams.
var reservedParams = map[string]bool{
	"percentiles": true,
	"p":           true,
	"step":        true,
}

// parseQueryParams parses query parameters into label filters and
// percentiles. Reserved keys (percentiles/p/step) are excluded from
// the label filter map.
func parseQueryParams(req *http.Request) (labelFilters map[string]string, percentiles []float64) {
	query := req.URL.Query()
	labelFilters = make(map[string]string)

	if pStr := query.Get("percentiles"); pStr != "" {
		percentiles = parsePercentiles(pStr)
	} else if pStr := query.Get("p"); pStr != "" {
		percentiles = parsePercentiles(pStr)
	}

	for key, values := range query {
		if !reservedParams[strings.ToLower(key)] && len(values) > 0 {
			labelFilters[key] = values[0]
		}
	}

	return labelFilters, percentiles
}

// parsePercentiles parses a comma-separated string of percentile values
// in the [0.0, 1.0] range, dropping anything out of range or
// unparseable.
func parsePercentiles(pStr string) []float64 {
	parts := strings.Split(pStr, ",")
	var percentiles []float64
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		p, err := strconv.ParseFloat(part, 64)
		if err != nil {
			log.Printf("Warning: Invalid percentile value '%s', skipping", part)
			continue
		}
		if p < 0.0 || p > 1.0 {
			log.Printf("Warning: Percentile value %.2f out of range [0.0, 1.0], skipping", p)
			continue
		}
		percentiles = append(percentiles, p)
	}
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
