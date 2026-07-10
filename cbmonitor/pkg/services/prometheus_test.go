package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestNewPrometheusService_invalidURL(t *testing.T) {
	cases := []string{"", "not-a-url", "//missing-scheme"}
	for _, c := range cases {
		if _, err := NewPrometheusService(c, nil); err == nil {
			t.Errorf("expected error for baseURL %q", c)
		}
	}
}

func TestQueryRange_flattensMatrix(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got, want := r.URL.Path, "/api/v1/query_range"; got != want {
			t.Errorf("path = %q, want %q", got, want)
		}
		q := r.URL.Query()
		if q.Get("query") != `kv_ops{job="snap-1"}` {
			t.Errorf("query mismatch: %q", q.Get("query"))
		}
		if q.Get("step") == "" {
			t.Errorf("step missing")
		}
		_, _ = w.Write([]byte(`{
			"status":"success",
			"data":{
				"resultType":"matrix",
				"result":[
					{"metric":{"instance":"h1"},"values":[[1700000000,"1"],[1700000015,"2.5"]]},
					{"metric":{"instance":"h2"},"values":[[1700000000,"10"]]}
				]
			}
		}`))
	}))
	defer srv.Close()

	svc, err := NewPrometheusService(srv.URL, srv.Client())
	if err != nil {
		t.Fatalf("NewPrometheusService: %v", err)
	}

	start := time.Unix(1700000000, 0)
	end := time.Unix(1700000030, 0)
	points, err := svc.QueryRange(context.Background(), `kv_ops{job="snap-1"}`, start, end, 15*time.Second)
	if err != nil {
		t.Fatalf("QueryRange: %v", err)
	}
	if len(points) != 3 {
		t.Fatalf("got %d points, want 3 (h1 has 2, h2 has 1)", len(points))
	}
	// Series order preserved: h1's two samples first, then h2's one.
	wantVals := []float64{1, 2.5, 10}
	for i, p := range points {
		if p.Value != wantVals[i] {
			t.Errorf("point %d value = %v, want %v", i, p.Value, wantVals[i])
		}
	}
	if !strings.HasSuffix(points[0].Time, "Z") {
		t.Errorf("expected UTC RFC3339 time, got %q", points[0].Time)
	}
}

func TestQueryRange_promError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"status":"error","errorType":"bad_data","error":"unknown function"}`))
	}))
	defer srv.Close()

	svc, _ := NewPrometheusService(srv.URL, srv.Client())
	_, err := svc.QueryRange(context.Background(), "garbage", time.Unix(0, 0), time.Unix(60, 0), 15*time.Second)
	if err == nil {
		t.Fatal("expected error from prom error envelope")
	}
	if !strings.Contains(err.Error(), "bad_data") || !strings.Contains(err.Error(), "unknown function") {
		t.Errorf("error missing prom fields: %v", err)
	}
}

func TestQueryRange_httpError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("internal explosion (not JSON)"))
	}))
	defer srv.Close()

	svc, _ := NewPrometheusService(srv.URL, srv.Client())
	_, err := svc.QueryRange(context.Background(), `kv_ops{job="x"}`, time.Unix(0, 0), time.Unix(60, 0), 15*time.Second)
	if err == nil {
		t.Fatal("expected error from HTTP 500")
	}
	if !strings.Contains(err.Error(), "500") {
		t.Errorf("error missing status code: %v", err)
	}
}

func TestQueryRange_emptyMatrix(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"matrix","result":[]}}`))
	}))
	defer srv.Close()

	svc, _ := NewPrometheusService(srv.URL, srv.Client())
	points, err := svc.QueryRange(context.Background(), `kv_ops{job="x"}`, time.Unix(0, 0), time.Unix(60, 0), 15*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(points) != 0 {
		t.Errorf("expected zero points, got %d", len(points))
	}
}

func TestQueryRange_validation(t *testing.T) {
	svc, _ := NewPrometheusService("http://x", &http.Client{})
	if _, err := svc.QueryRange(context.Background(), "", time.Unix(0, 0), time.Unix(60, 0), 15*time.Second); err == nil {
		t.Error("expected error for empty query")
	}
	if _, err := svc.QueryRange(context.Background(), "q", time.Unix(0, 0), time.Unix(60, 0), 0); err == nil {
		t.Error("expected error for zero step")
	}
	if _, err := svc.QueryRange(context.Background(), "q", time.Unix(60, 0), time.Unix(0, 0), 15*time.Second); err == nil {
		t.Error("expected error when end < start")
	}
}

func TestQueryRange_contextCancel(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer srv.Close()

	svc, _ := NewPrometheusService(srv.URL, srv.Client())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := svc.QueryRange(ctx, `kv_ops{job="x"}`, time.Unix(0, 0), time.Unix(60, 0), 15*time.Second)
	if err == nil {
		t.Fatal("expected cancellation error")
	}
}

func TestListMetricNames_cachesWithinTTL(t *testing.T) {
	var requests int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		_, _ = w.Write([]byte(`{"status":"success","data":["kv_ops","kv_get"]}`))
	}))
	defer srv.Close()

	svc, _ := NewPrometheusService(srv.URL, srv.Client())
	start := time.Unix(0, 0)
	end := time.Unix(60, 0)

	names1, err := svc.ListMetricNames(context.Background(), "snap-1", "", start, end)
	if err != nil {
		t.Fatalf("first call: %v", err)
	}
	names2, err := svc.ListMetricNames(context.Background(), "snap-1", "", start, end)
	if err != nil {
		t.Fatalf("second call: %v", err)
	}

	if requests != 1 {
		t.Errorf("expected 1 HTTP request (second call served from cache), got %d", requests)
	}
	if len(names1) != 2 || len(names2) != 2 {
		t.Errorf("unexpected results: %v / %v", names1, names2)
	}
}

func TestListMetricNames_differentRegexBypassesCache(t *testing.T) {
	var requests int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		_, _ = w.Write([]byte(`{"status":"success","data":["kv_ops"]}`))
	}))
	defer srv.Close()

	svc, _ := NewPrometheusService(srv.URL, srv.Client())
	start := time.Unix(0, 0)
	end := time.Unix(60, 0)

	if _, err := svc.ListMetricNames(context.Background(), "snap-1", "kv_.*", start, end); err != nil {
		t.Fatalf("first call: %v", err)
	}
	if _, err := svc.ListMetricNames(context.Background(), "snap-1", "n1ql_.*", start, end); err != nil {
		t.Fatalf("second call: %v", err)
	}

	if requests != 2 {
		t.Errorf("expected 2 HTTP requests (distinct regex keys), got %d", requests)
	}
}
