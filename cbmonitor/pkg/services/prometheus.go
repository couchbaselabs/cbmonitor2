package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/couchbase/cbmonitor/pkg/models"
)

// PrometheusService is a thin HTTP client for a Prometheus-compatible
// query API. It exposes only what the snapshot
// metrics handlers need: a range query that flattens the matrix
// response into a single []MetricDataPoint, mirroring the flat shape
// the Couchbase-backed path returns today.
type PrometheusService struct {
	baseURL    string
	httpClient *http.Client
	namesCache *ttlCache[metricNamesCacheKey, []string]
}

// NewPrometheusService validates baseURL is absolute and returns a
// service. If httpClient is nil a default client with a 30s timeout is used.
func NewPrometheusService(baseURL string, httpClient *http.Client) (*PrometheusService, error) {
	u, err := url.Parse(baseURL)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("prometheus baseURL must be absolute (e.g. http://mimir:9009), got %q", baseURL)
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	return &PrometheusService{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: httpClient,
		namesCache: newTTLCache[metricNamesCacheKey, []string](metricNamesCacheTTL),
	}, nil
}

// Close is a no-op kept for symmetry with CouchbaseService so App
// teardown can treat both uniformly.
func (p *PrometheusService) Close() error { return nil }

type queryRangeResponse struct {
	Status    string `json:"status"`
	ErrorType string `json:"errorType,omitempty"`
	Error     string `json:"error,omitempty"`
	Data      struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Values [][2]any          `json:"values"`
		} `json:"result"`
	} `json:"data"`
}

// QueryRange executes a PromQL range query and returns the samples
// flattened into a single slice. Series appear in the order Mimir
// returns them; within a series, samples are in time order.
func (p *PrometheusService) QueryRange(ctx context.Context, query string, start, end time.Time, step time.Duration) ([]models.MetricDataPoint, error) {
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}
	if step <= 0 {
		return nil, fmt.Errorf("step must be positive, got %s", step)
	}
	if !end.After(start) && !end.Equal(start) {
		return nil, fmt.Errorf("end %s must be >= start %s", end, start)
	}

	endpoint := p.baseURL + "/api/v1/query_range"
	params := url.Values{}
	params.Set("query", query)
	params.Set("start", formatUnixFloat(start))
	params.Set("end", formatUnixFloat(end))
	params.Set("step", formatStep(step))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?"+params.Encode(), nil)
	if err != nil {
		return nil, fmt.Errorf("build prometheus request: %w", err)
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("prometheus request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read prometheus response: %w", err)
	}

	// Prometheus returns 4xx/5xx with a JSON error envelope; try to
	// surface its errorType/error fields rather than a raw status code.
	var decoded queryRangeResponse
	if jerr := json.Unmarshal(body, &decoded); jerr != nil {
		if resp.StatusCode >= 400 {
			return nil, fmt.Errorf("prometheus HTTP %d: %s", resp.StatusCode, truncate(string(body), 200))
		}
		return nil, fmt.Errorf("decode prometheus response: %w", jerr)
	}

	if decoded.Status != "success" {
		msg := decoded.Error
		if msg == "" {
			msg = string(body)
		}
		return nil, fmt.Errorf("prometheus error (%s): %s", decoded.ErrorType, msg)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("prometheus HTTP %d: %s", resp.StatusCode, decoded.Error)
	}

	if decoded.Data.ResultType != "" && decoded.Data.ResultType != "matrix" {
		return nil, fmt.Errorf("unexpected prometheus resultType %q (expected matrix)", decoded.Data.ResultType)
	}

	var points []models.MetricDataPoint
	for _, series := range decoded.Data.Result {
		for _, sample := range series.Values {
			ts, ok := sampleTimestamp(sample[0])
			if !ok {
				continue
			}
			val, ok := sampleValue(sample[1])
			if !ok {
				continue
			}
			points = append(points, models.MetricDataPoint{
				Time:  ts.UTC().Format(time.RFC3339),
				Value: val,
			})
		}
	}
	return points, nil
}

// labelValuesResponse mirrors /api/v1/label/__name__/values.
type labelValuesResponse struct {
	Status    string   `json:"status"`
	ErrorType string   `json:"errorType,omitempty"`
	Error     string   `json:"error,omitempty"`
	Data      []string `json:"data"`
}

// ListMetricNames returns the metric names visible to the configured
// Prometheus endpoint, restricted to a single job (snapshot id) and
// optionally further constrained by a name regex. Empty nameRegex
// returns every metric name for the job.
func (p *PrometheusService) ListMetricNames(ctx context.Context, snapshotID, nameRegex string, start, end time.Time) ([]string, error) {
	if snapshotID == "" {
		return nil, fmt.Errorf("snapshotID is required")
	}

	// Keyed on (snapshotID, nameRegex) only: the window is derived from
	// snapshot metadata that's itself cached for the same TTL, so it's
	// effectively stable for the life of this cache entry.
	key := metricNamesCacheKey{snapshotID: snapshotID, nameRegex: nameRegex}
	if cached, ok := p.namesCache.get(key); ok {
		return cached, nil
	}

	matcher := fmt.Sprintf(`{job=%s}`, promQuote(snapshotID))
	if nameRegex != "" {
		matcher = fmt.Sprintf(`{job=%s,__name__=~%s}`, promQuote(snapshotID), promQuote(nameRegex))
	}

	endpoint := p.baseURL + "/api/v1/label/__name__/values"
	params := url.Values{}
	params.Set("match[]", matcher)
	if !start.IsZero() {
		params.Set("start", formatUnixFloat(start))
	}
	if !end.IsZero() {
		params.Set("end", formatUnixFloat(end))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?"+params.Encode(), nil)
	if err != nil {
		return nil, fmt.Errorf("build prometheus request: %w", err)
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("prometheus request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read prometheus response: %w", err)
	}

	var decoded labelValuesResponse
	if jerr := json.Unmarshal(body, &decoded); jerr != nil {
		if resp.StatusCode >= 400 {
			return nil, fmt.Errorf("prometheus HTTP %d: %s", resp.StatusCode, truncate(string(body), 200))
		}
		return nil, fmt.Errorf("decode prometheus response: %w", jerr)
	}

	if decoded.Status != "success" {
		msg := decoded.Error
		if msg == "" {
			msg = string(body)
		}
		return nil, fmt.Errorf("prometheus error (%s): %s", decoded.ErrorType, msg)
	}

	p.namesCache.set(key, decoded.Data)
	return decoded.Data, nil
}

// promQuote wraps a value in double quotes, escaping backslashes and
// double-quotes per the PromQL grammar. Kept here (vs. pkg/promqlbuilder)
// to avoid importing that package from the services layer.
func promQuote(v string) string {
	var b strings.Builder
	b.Grow(len(v) + 2)
	b.WriteByte('"')
	for _, r := range v {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '"':
			b.WriteString(`\"`)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String()
}

// sampleTimestamp converts a Prometheus sample timestamp (a JSON number,
// decoded as float64) to a time.Time. Returns ok=false on a value we
// can't interpret so the caller can skip the sample.
func sampleTimestamp(v any) (time.Time, bool) {
	switch t := v.(type) {
	case float64:
		sec := int64(t)
		nsec := int64((t - float64(sec)) * 1e9)
		return time.Unix(sec, nsec), true
	case json.Number:
		f, err := t.Float64()
		if err != nil {
			return time.Time{}, false
		}
		sec := int64(f)
		nsec := int64((f - float64(sec)) * 1e9)
		return time.Unix(sec, nsec), true
	}
	return time.Time{}, false
}

// sampleValue parses a Prometheus sample value, which is always a string
// in the wire format (so NaN/+Inf/-Inf round-trip cleanly).
func sampleValue(v any) (float64, bool) {
	s, ok := v.(string)
	if !ok {
		return 0, false
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, false
	}
	return f, true
}

// formatUnixFloat is the encoding /api/v1/query_range expects for
// start/end: Unix seconds as a decimal, optionally fractional.
func formatUnixFloat(t time.Time) string {
	return strconv.FormatFloat(float64(t.UnixNano())/1e9, 'f', -1, 64)
}

// formatStep renders a duration the way Prometheus expects it
// ("15s", "1m30s"...). Using d.String() works for typical values
// (seconds, minutes) but emits e.g. "1h0m0s" for whole hours, which
// Prometheus accepts. Acceptable here; tests guard the common cases.
func formatStep(d time.Duration) string {
	return d.String()
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
