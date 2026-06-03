// Package cbeval evaluates PromQL against samples stored in Couchbase by
// running the real Prometheus query engine over a storage adapter. The adapter
// translates each selector to SQL++ and returns the raw samples; the engine
// computes rate/irate/increase, aggregation, and every other PromQL construct
// with exact Prometheus semantics — the same engine Mimir uses — so results
// match a Prometheus/Mimir passthrough by construction.
package cbeval

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/prometheus/model/histogram"
	"github.com/prometheus/prometheus/model/labels"
	"github.com/prometheus/prometheus/promql"
	"github.com/prometheus/prometheus/storage"
	"github.com/prometheus/prometheus/tsdb/chunkenc"
	"github.com/prometheus/prometheus/tsdb/chunks"
	"github.com/prometheus/prometheus/util/annotations"

	"github.com/couchbase/datasource-gateway/internal/querybuilder"
)

const (
	defaultMaxSamples = 50_000_000
	defaultTimeout    = 2 * time.Minute
)

// RowQuerier executes a SQL++ statement and returns the rows. The Couchbase
// client satisfies this.
type RowQuerier interface {
	ExecuteQuery(ctx context.Context, query string) ([]map[string]interface{}, error)
}

// Result is the Prometheus-API response shape produced by the evaluator.
type Result struct {
	Status string     `json:"status"`
	Data   ResultData `json:"data"`
}

// ResultData is the data envelope of a Prometheus query response.
type ResultData struct {
	ResultType string       `json:"resultType"`
	Result     []SeriesJSON `json:"result"`
}

// SeriesJSON is one matrix series in Prometheus JSON form.
type SeriesJSON struct {
	Metric map[string]string `json:"metric"`
	Values [][]interface{}   `json:"values,omitempty"`
}

// Evaluator runs the Prometheus query engine over Couchbase-backed samples.
type Evaluator struct {
	engine   *promql.Engine
	querier  RowQuerier
	keyspace string
}

// NewEvaluator builds an evaluator that fetches samples via querier from the
// given metrics keyspace (bucket.scope.collection).
func NewEvaluator(querier RowQuerier, keyspace string) *Evaluator {
	engine := promql.NewEngine(promql.EngineOpts{
		MaxSamples:           defaultMaxSamples,
		Timeout:              defaultTimeout,
		EnableAtModifier:     true,
		EnableNegativeOffset: true,
	})
	return &Evaluator{engine: engine, querier: querier, keyspace: keyspace}
}

// RangeQuery evaluates a PromQL range query against Couchbase-backed samples
// and returns the matrix result in Prometheus JSON form.
func (e *Evaluator) RangeQuery(ctx context.Context, query string, start, end time.Time, step time.Duration) (*Result, error) {
	q, err := e.engine.NewRangeQuery(ctx, e.queryable(), nil, query, start, end, step)
	if err != nil {
		return nil, err
	}
	defer q.Close()

	res := q.Exec(ctx)
	if res.Err != nil {
		return nil, res.Err
	}
	matrix, ok := res.Value.(promql.Matrix)
	if !ok {
		return nil, fmt.Errorf("unexpected result type %s for range query", res.Value.Type())
	}
	return matrixToResult(matrix), nil
}

func (e *Evaluator) queryable() storage.Queryable {
	return &couchbaseQueryable{querier: e.querier, keyspace: e.keyspace}
}

func matrixToResult(m promql.Matrix) *Result {
	out := &Result{Status: "success"}
	out.Data.ResultType = "matrix"
	out.Data.Result = make([]SeriesJSON, 0, len(m))
	for _, s := range m {
		sj := SeriesJSON{Metric: s.Metric.Map(), Values: make([][]interface{}, 0, len(s.Floats))}
		for _, p := range s.Floats {
			sj.Values = append(sj.Values, []interface{}{
				float64(p.T) / 1000,
				strconv.FormatFloat(p.F, 'f', -1, 64),
			})
		}
		out.Data.Result = append(out.Data.Result, sj)
	}
	return out
}

// --- storage adapter ---

type couchbaseQueryable struct {
	querier  RowQuerier
	keyspace string
}

func (q *couchbaseQueryable) Querier(mint, maxt int64) (storage.Querier, error) {
	return &couchbaseQuerier{querier: q.querier, keyspace: q.keyspace, mint: mint, maxt: maxt}, nil
}

type couchbaseQuerier struct {
	querier    RowQuerier
	keyspace   string
	mint, maxt int64
}

func (q *couchbaseQuerier) Select(ctx context.Context, sortSeries bool, hints *storage.SelectHints, matchers ...*labels.Matcher) storage.SeriesSet {
	from, to := q.mint, q.maxt
	if hints != nil {
		from, to = hints.Start, hints.End
	}
	sql, err := buildSelectorSQL(matchers, q.keyspace, from, to)
	if err != nil {
		return storage.ErrSeriesSet(err)
	}
	rows, err := q.querier.ExecuteQuery(ctx, sql)
	if err != nil {
		return storage.ErrSeriesSet(fmt.Errorf("couchbase query failed: %w", err))
	}
	series := rowsToSeries(rows, metricName(matchers))
	if sortSeries {
		sort.Slice(series, func(i, j int) bool {
			return labels.Compare(series[i].Labels(), series[j].Labels()) < 0
		})
	}
	return &sliceSeriesSet{series: series, idx: -1}
}

func (q *couchbaseQuerier) LabelValues(context.Context, string, *storage.LabelHints, ...*labels.Matcher) ([]string, annotations.Annotations, error) {
	return nil, nil, nil
}

func (q *couchbaseQuerier) LabelNames(context.Context, *storage.LabelHints, ...*labels.Matcher) ([]string, annotations.Annotations, error) {
	return nil, nil, nil
}

func (q *couchbaseQuerier) Close() error { return nil }

// --- row parsing ---

func metricName(matchers []*labels.Matcher) string {
	for _, m := range matchers {
		if m.Name == labels.MetricName {
			return m.Value
		}
	}
	return ""
}

func rowsToSeries(rows []map[string]interface{}, metric string) []storage.Series {
	grouped := map[string]*seriesBuilder{}
	var order []string
	for _, row := range rows {
		lbls := rowLabels(row, metric)
		key := lbls.String()
		sb, ok := grouped[key]
		if !ok {
			sb = &seriesBuilder{lbls: lbls}
			grouped[key] = sb
			order = append(order, key)
		}
		ts, ok := rowMillis(row["time"])
		if !ok {
			continue
		}
		v, ok := rowFloat(row["value"])
		if !ok {
			continue
		}
		sb.samples = append(sb.samples, floatSample{t: ts, v: v})
	}

	series := make([]storage.Series, 0, len(order))
	for _, key := range order {
		sb := grouped[key]
		sort.Slice(sb.samples, func(i, j int) bool { return sb.samples[i].t < sb.samples[j].t })
		cs := make([]chunks.Sample, len(sb.samples))
		for i := range sb.samples {
			cs[i] = sb.samples[i]
		}
		series = append(series, storage.NewListSeries(sb.lbls, cs))
	}
	return series
}

type seriesBuilder struct {
	lbls    labels.Labels
	samples []floatSample
}

func rowLabels(row map[string]interface{}, metric string) labels.Labels {
	b := labels.NewBuilder(labels.EmptyLabels())
	if metric != "" {
		b.Set(labels.MetricName, metric)
	}
	if raw, ok := row["labels"].(map[string]interface{}); ok {
		for k, v := range raw {
			b.Set(k, fmt.Sprintf("%v", v))
		}
	}
	return b.Labels()
}

func rowMillis(v interface{}) (int64, bool) {
	switch t := v.(type) {
	case string:
		if ts, err := time.Parse(time.RFC3339, t); err == nil {
			return ts.UnixMilli(), true
		}
		if ms, err := strconv.ParseInt(t, 10, 64); err == nil {
			return ms, true
		}
	case float64:
		return int64(t), true
	case int64:
		return t, true
	}
	return 0, false
}

func rowFloat(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int64:
		return float64(n), true
	case int:
		return float64(n), true
	case string:
		if f, err := strconv.ParseFloat(n, 64); err == nil {
			return f, true
		}
	}
	return 0, false
}

// --- minimal chunks.Sample + storage.SeriesSet implementations ---

type floatSample struct {
	t int64
	v float64
}

func (s floatSample) T() int64                      { return s.t }
func (s floatSample) F() float64                    { return s.v }
func (s floatSample) H() *histogram.Histogram       { return nil }
func (s floatSample) FH() *histogram.FloatHistogram { return nil }
func (s floatSample) Type() chunkenc.ValueType      { return chunkenc.ValFloat }
func (s floatSample) Copy() chunks.Sample           { return s }

type sliceSeriesSet struct {
	series []storage.Series
	idx    int
}

func (s *sliceSeriesSet) Next() bool                        { s.idx++; return s.idx < len(s.series) }
func (s *sliceSeriesSet) At() storage.Series                { return s.series[s.idx] }
func (s *sliceSeriesSet) Err() error                        { return nil }
func (s *sliceSeriesSet) Warnings() annotations.Annotations { return nil }

// --- selector SQL ---

// buildSelectorSQL turns one vector selector's label matchers into the SQL++
// that fetches its raw samples over [fromMillis, toMillis]. The metric name
// filters the document; label matchers (=, !=, =~, !~) reuse the shared label
// clause builder; the window is bound into the _timeseries range.
func buildSelectorSQL(matchers []*labels.Matcher, keyspace string, fromMillis, toMillis int64) (string, error) {
	var metric string
	var filters []querybuilder.LabelFilter
	for _, m := range matchers {
		if m.Name == labels.MetricName {
			if m.Type != labels.MatchEqual {
				return "", fmt.Errorf("metric name must use an equality matcher, got %q", m.String())
			}
			metric = m.Value
			continue
		}
		filters = append(filters, querybuilder.LabelFilter{Name: m.Name, Value: m.Value, Op: matchOp(m.Type)})
	}
	if metric == "" {
		return "", fmt.Errorf("selector has no metric name")
	}

	conds := []string{fmt.Sprintf("d.metric_name = '%s'", escapeSQL(metric))}
	if lw := querybuilder.BuildLabelWhereClauseFromFilters(filters); lw != "" {
		conds = append(conds, lw)
	}

	return fmt.Sprintf(
		"SELECT MILLIS_TO_STR(t._t) AS time, t._v0 AS `value`, d.labels AS labels "+
			"FROM %s AS d UNNEST _timeseries(d, {'ts_ranges':[%d, %d]}) AS t WHERE %s",
		keyspace, fromMillis, toMillis, strings.Join(conds, " AND "),
	), nil
}

func matchOp(t labels.MatchType) string {
	switch t {
	case labels.MatchNotEqual:
		return "!="
	case labels.MatchRegexp:
		return "=~"
	case labels.MatchNotRegexp:
		return "!~"
	default:
		return "="
	}
}

func escapeSQL(s string) string { return strings.ReplaceAll(s, "'", "''") }
