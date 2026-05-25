package handlers

import (
	"context"
	"fmt"
	"time"

	"github.com/couchbase/cbmonitor/pkg/models"
	"github.com/couchbase/cbmonitor/pkg/promqlbuilder"
	"github.com/couchbase/cbmonitor/pkg/services"
)

// prometheusMetricSource fetches snapshot metric data from a Prometheus-
// compatible HTTP endpoint. The caller must populate req.Start / req.End
// (and the phase window, if any) before calling — this source issues a
// single range query and does no metadata lookup of its own.
type prometheusMetricSource struct {
	prometheus *services.PrometheusService
}

func (s *prometheusMetricSource) Fetch(ctx context.Context, req metricRequest) ([]models.MetricDataPoint, error) {
	if s.prometheus == nil {
		return nil, errMetricSourceUnavailable("prometheus metrics service is not available; check plugin settings (PrometheusDatasource.URL)")
	}

	selector, err := promqlbuilder.BuildSelector(req.Metric, req.SnapshotID, req.LabelFilters)
	if err != nil {
		return nil, fmt.Errorf("build promql selector: %w", err)
	}

	return s.prometheus.QueryRange(ctx, selector, req.Start, req.End, req.Step)
}

// prometheusMetricNamesSource discovers metric names via the Prometheus
// /api/v1/label/__name__/values endpoint, scoped to the snapshot's job
// and time window when metadata is available.
type prometheusMetricNamesSource struct {
	prometheus      *services.PrometheusService
	snapshotService snapshotFetcher
}

func (s *prometheusMetricNamesSource) ListNames(ctx context.Context, snapshotID, nameRegex string) ([]string, error) {
	if s.prometheus == nil {
		return nil, errMetricSourceUnavailable("prometheus metrics service is not available; check plugin settings (PrometheusDatasource.URL)")
	}

	start, end := s.resolveWindow(ctx, snapshotID)
	return s.prometheus.ListMetricNames(ctx, snapshotID, nameRegex, start, end)
}

// resolveWindow returns the snapshot's ts_start/ts_end when metadata is
// available; otherwise a 15-minute window ending at now (matching the
// fallback used by the metric handlers). A zero start/end is acceptable
// — the Prometheus client omits them entirely.
func (s *prometheusMetricNamesSource) resolveWindow(ctx context.Context, snapshotID string) (time.Time, time.Time) {
	if s.snapshotService == nil {
		now := time.Now().UTC()
		return now.Add(-defaultFallbackWindow), now
	}
	snap, err := s.snapshotService.GetSnapshotByID(ctx, snapshotID)
	if err != nil {
		now := time.Now().UTC()
		return now.Add(-defaultFallbackWindow), now
	}
	start, end, ok := parseSnapshotWindow(snap.Metadata.TSStart, snap.Metadata.TSEnd)
	if !ok {
		now := time.Now().UTC()
		return now.Add(-defaultFallbackWindow), now
	}
	return start, end
}
