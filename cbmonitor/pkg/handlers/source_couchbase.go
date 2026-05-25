package handlers

import (
	"context"
	"fmt"
	"log"

	"github.com/couchbase/cbmonitor/pkg/models"
	"github.com/couchbase/cbmonitor/pkg/querybuilder"
	"github.com/couchbase/cbmonitor/pkg/services"
)

// couchbaseMetricSource fetches snapshot metric data from Couchbase by
// rendering the request as a SQL++ query that filters by metric name +
// snapshot job + label conditions, and JOINs the metadata bucket so the
// time range / phase windows are applied without a separate metadata
// fetch.
type couchbaseMetricSource struct {
	couchbase       *services.CouchbaseService
	snapshotService snapshotFetcher
}

func (s *couchbaseMetricSource) Fetch(ctx context.Context, req metricRequest) ([]models.MetricDataPoint, error) {
	if s.couchbase == nil {
		return nil, errMetricSourceUnavailable("couchbase metrics service is not available")
	}

	whereClause := querybuilder.BuildLabelWhereClause(req.LabelFilters)
	whereClause = s.applyClusterFilter(ctx, req.SnapshotID, req.LabelFilters, whereClause)

	var query string
	if req.PhaseName == "" {
		query = querybuilder.BuildSnapshotQuery(req.Metric, req.SnapshotID, []string{"time", "value"}, whereClause)
	} else {
		query = querybuilder.BuildPhaseQuery(req.Metric, req.SnapshotID, req.PhaseName, []string{"time", "value"}, whereClause)
	}

	results, err := s.couchbase.ExecuteQuery(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("execute couchbase query: %w", err)
	}

	return rowsToPoints(results), nil
}

func (s *couchbaseMetricSource) applyClusterFilter(ctx context.Context, snapshotID string, labelFilters map[string]string, whereClause string) string {
	clusterFilter, ok := labelFilters["cluster"]
	if !ok || s.snapshotService == nil {
		return whereClause
	}

	snapshotData, err := s.snapshotService.GetSnapshotByID(ctx, snapshotID)
	if err != nil {
		log.Printf("couchbaseMetricSource: cluster target lookup failed: %v", err)
		return whereClause
	}

	var targets []string
	for _, cluster := range snapshotData.Metadata.Clusters {
		if cluster.UID == clusterFilter || cluster.Name == clusterFilter {
			targets = querybuilder.StripPortsFromTargets(cluster.Targets)
			break
		}
	}
	if len(targets) == 0 {
		log.Printf("couchbaseMetricSource: cluster %q not found in snapshot metadata", clusterFilter)
		return whereClause
	}

	instanceClause := querybuilder.BuildInstanceInClause(targets)
	if whereClause == "" {
		return instanceClause
	}
	return whereClause + " AND " + instanceClause
}

// couchbaseMetricNamesSource discovers metric names by querying the
// Couchbase metrics scope for DISTINCT metric_name values scoped to the
// snapshot's job.
type couchbaseMetricNamesSource struct {
	couchbase *services.CouchbaseService
}

func (s *couchbaseMetricNamesSource) ListNames(ctx context.Context, snapshotID, nameRegex string) ([]string, error) {
	if s.couchbase == nil {
		return nil, errMetricSourceUnavailable("couchbase metrics service is not available")
	}
	names, err := s.couchbase.ListMetricNames(ctx, snapshotID, nameRegex)
	if err != nil {
		return nil, fmt.Errorf("execute couchbase metric-names query: %w", err)
	}
	return names, nil
}

// rowsToPoints converts Couchbase result rows (each a map with `time`
// and `value` fields, optionally wrapped in a `data` envelope) into a
// flat MetricDataPoint slice.
func rowsToPoints(results []map[string]interface{}) []models.MetricDataPoint {
	var points []models.MetricDataPoint
	for _, row := range results {
		actualRow := row
		if data, ok := row["data"].(map[string]interface{}); ok {
			actualRow = data
		}
		timeStr, ok := actualRow["time"].(string)
		if !ok {
			continue
		}
		value, ok := numericValue(actualRow["value"])
		if !ok {
			continue
		}
		points = append(points, models.MetricDataPoint{
			Time:  timeStr,
			Value: value,
		})
	}
	return points
}

func numericValue(v interface{}) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	}
	return 0, false
}
