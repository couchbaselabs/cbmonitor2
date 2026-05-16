package handlers

import (
	"context"
	"fmt"

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
