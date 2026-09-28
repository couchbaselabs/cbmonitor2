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
	// defaultSubqueryStep is the evaluation interval used for a subquery that
	// specifies no step of its own (e.g. `max_over_time(x[10m:])`), matching
	// Prometheus' own default evaluation interval.
	defaultSubqueryStep = time.Minute
)

// RowQuerier executes a SQL++ statement with its bound parameters and returns the rows. The Couchbase client satisfies this.
type RowQuerier interface {
	ExecuteQuery(ctx context.Context, query string, params map[string]interface{}) ([]map[string]interface{}, error)
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

// SeriesJSON is one series in Prometheus JSON form: Values carries matrix
// points, Value the single vector point.
type SeriesJSON struct {
	Metric map[string]string `json:"metric"`
	Values [][]interface{}   `json:"values,omitempty"`
	Value  []interface{}     `json:"value,omitempty"`
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
		// The engine calls this unconditionally for a step-less subquery, from
		// a path outside its own panic recovery, so it must be set.
		NoStepSubqueryIntervalFn: func(int64) int64 { return defaultSubqueryStep.Milliseconds() },
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

// InstantQuery evaluates a PromQL instant query at ts and returns the result
// in Prometheus JSON form. Vector and matrix (range-selector) results are
// supported. Every metric-selector query produces one of those; scalar/string
// expressions (no selector, so nothing Couchbase-backed) are rejected.
func (e *Evaluator) InstantQuery(ctx context.Context, query string, ts time.Time) (*Result, error) {
	q, err := e.engine.NewInstantQuery(ctx, e.queryable(), nil, query, ts)
	if err != nil {
		return nil, err
	}
	defer q.Close()

	res := q.Exec(ctx)
	if res.Err != nil {
		return nil, res.Err
	}
	switch v := res.Value.(type) {
	case promql.Vector:
		return vectorToResult(v), nil
	case promql.Matrix:
		return matrixToResult(v), nil
	default:
		return nil, fmt.Errorf("unsupported result type %s for instant query", res.Value.Type())
	}
}

func (e *Evaluator) queryable() storage.Queryable {
	return &couchbaseQueryable{querier: e.querier, keyspace: e.keyspace}
}

func vectorToResult(v promql.Vector) *Result {
	out := &Result{Status: "success"}
	out.Data.ResultType = "vector"
	out.Data.Result = make([]SeriesJSON, 0, len(v))
	for _, s := range v {
		out.Data.Result = append(out.Data.Result, SeriesJSON{
			Metric: s.Metric.Map(),
			Value: []interface{}{
				float64(s.T) / 1000,
				strconv.FormatFloat(s.F, 'f', -1, 64),
			},
		})
	}
	return out
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
	sql, params, err := buildSelectorSQL(matchers, q.keyspace, from, to)
	if err != nil {
		return storage.ErrSeriesSet(err)
	}
	rows, err := q.querier.ExecuteQuery(ctx, sql, params)
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
// that fetches its raw samples over [fromMillis, toMillis], plus the named
// parameters to bind. The metric name filters the document; label matchers
// (=, !=, =~, !~) reuse the shared label clause builder; the window is bound
// into the _timeseries range. Every value travels as a parameter, so no part of
// a PromQL query can alter the statement's structure.
func buildSelectorSQL(matchers []*labels.Matcher, keyspace string, fromMillis, toMillis int64) (string, map[string]interface{}, error) {
	var metric string
	var filters []querybuilder.LabelFilter
	for _, m := range matchers {
		if m.Name == labels.MetricName {
			if m.Type != labels.MatchEqual {
				return "", nil, fmt.Errorf("metric name must use an equality matcher, got %q", m.String())
			}
			metric = m.Value
			continue
		}
		filters = append(filters, querybuilder.LabelFilter{Name: m.Name, Value: m.Value, Op: matchOp(m.Type)})
	}
	if metric == "" {
		return "", nil, fmt.Errorf("selector has no metric name")
	}

	params := querybuilder.NewParams()
	conds := []string{fmt.Sprintf("d.metric_name = %s", params.Add(metric))}
	lw, err := querybuilder.BuildLabelWhereClauseFromFilters(filters, params)
	if err != nil {
		return "", nil, err
	}
	if lw != "" {
		conds = append(conds, lw)
	}

	return fmt.Sprintf(
		"SELECT MILLIS_TO_STR(t._t) AS time, t._v0 AS `value`, d.labels AS labels "+
			"FROM %s AS d UNNEST _timeseries(d, {'ts_ranges':[%s, %s]}) AS t WHERE %s",
		keyspace, params.Add(fromMillis), params.Add(toMillis), strings.Join(conds, " AND "),
	), params.Values(), nil
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
