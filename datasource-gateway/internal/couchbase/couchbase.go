package couchbase

import (
	"context"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"github.com/couchbase/gocb/v2"
)

const queryTimeout = 30 * time.Second

// Config holds the Couchbase connection settings the gateway needs.
type Config struct {
	Enabled           bool
	ConnectionString  string // e.g. "couchbase://localhost"
	Username          string
	Password          string
	MetadataBucket    string // snapshot metadata documents (default collection)
	MetricsBucket     string // metrics keyspace
	MetricsScope      string
	MetricsCollection string
}

// Metadata is the subset of a snapshot's metadata document the gateway uses
// for routing and time-window resolution.
type Metadata struct {
	ID       string
	TSStart  string
	TSEnd    string
	Store    string // optional routing hint: "couchbase" | "prometheus"
	Products []string
	Phases   []Phase
}

// Phase is a labelled sub-window within a snapshot.
type Phase struct {
	Label   string
	TSStart string
	TSEnd   string
}

// Client is the gateway's Couchbase client. It connects without blocking
// startup (readiness is verified in the background) and degrades cleanly:
// when disabled or unavailable, Ready() is false and queries return a clear
// error instead of panicking.
type Client struct {
	cfg          Config
	cluster      *gocb.Cluster
	metadataColl *gocb.Collection
	metricsScope *gocb.Scope
	ready        atomic.Bool
}

// New constructs the client. When cfg.Enabled is false it returns a disabled
// stub. On a connect error it returns a degraded (not-ready) client together
// with the error, so the caller can log and keep serving the Prometheus path.
func New(cfg Config) (*Client, error) {
	c := &Client{cfg: cfg}
	if !cfg.Enabled {
		return c, nil
	}

	cluster, err := gocb.Connect(cfg.ConnectionString, gocb.ClusterOptions{
		Authenticator: gocb.PasswordAuthenticator{
			Username: cfg.Username,
			Password: cfg.Password,
		},
	})
	if err != nil {
		return c, fmt.Errorf("connect to Couchbase: %w", err)
	}

	scopeName := cfg.MetricsScope
	if scopeName == "" {
		scopeName = "_default"
	}

	metaBucket := cluster.Bucket(cfg.MetadataBucket)
	metricsBucket := cluster.Bucket(cfg.MetricsBucket)

	c.cluster = cluster
	c.metadataColl = metaBucket.DefaultCollection()
	c.metricsScope = metricsBucket.Scope(scopeName)

	// Verify readiness in the background. gocb.Connect/Bucket do no network
	// I/O; only WaitUntilReady blocks. Keeping it off the startup path means
	// the gateway serves /healthz immediately and queries queue until ready.
	go c.waitUntilReady(metaBucket, metricsBucket)

	return c, nil
}

func (c *Client) waitUntilReady(buckets ...*gocb.Bucket) {
	seen := make(map[string]bool)
	for _, b := range buckets {
		if b == nil || seen[b.Name()] {
			continue
		}
		seen[b.Name()] = true
		if err := b.WaitUntilReady(30*time.Second, nil); err != nil {
			// Stays not-ready; the health endpoint reflects it.
			return
		}
	}
	c.ready.Store(true)
}

// Enabled reports whether the Couchbase path is configured on.
func (c *Client) Enabled() bool { return c.cfg.Enabled }

// Ready reports whether the buckets have become reachable.
func (c *Client) Ready() bool { return c.ready.Load() }

// GetSnapshotMetadata fetches and parses the subset of a snapshot's metadata
// document used for routing and time-window resolution.
func (c *Client) GetSnapshotMetadata(ctx context.Context, snapshotID string) (*Metadata, error) {
	if c.metadataColl == nil {
		return nil, fmt.Errorf("couchbase metadata is unavailable")
	}
	res, err := c.metadataColl.Get(snapshotID, &gocb.GetOptions{Context: ctx, Timeout: queryTimeout})
	if err != nil {
		if err == gocb.ErrDocumentNotFound {
			return nil, fmt.Errorf("snapshot not found: %s", snapshotID)
		}
		return nil, fmt.Errorf("fetch snapshot metadata: %w", err)
	}

	var raw map[string]interface{}
	if err := res.Content(&raw); err != nil {
		return nil, fmt.Errorf("decode snapshot metadata: %w", err)
	}

	md := &Metadata{ID: snapshotID}
	if v, ok := raw["ts_start"].(string); ok {
		md.TSStart = v
	}
	if v, ok := raw["ts_end"].(string); ok {
		md.TSEnd = v
	}
	if v, ok := raw["store"].(string); ok {
		md.Store = v
	}
	if arr, ok := raw["products"].([]interface{}); ok {
		for _, p := range arr {
			if s, ok := p.(string); ok {
				md.Products = append(md.Products, s)
			}
		}
	}
	if arr, ok := raw["phases"].([]interface{}); ok {
		for _, p := range arr {
			pm, ok := p.(map[string]interface{})
			if !ok {
				continue
			}
			ph := Phase{}
			if s, ok := pm["label"].(string); ok {
				ph.Label = s
			}
			if s, ok := pm["ts_start"].(string); ok {
				ph.TSStart = s
			}
			if s, ok := pm["ts_end"].(string); ok {
				ph.TSEnd = s
			}
			md.Phases = append(md.Phases, ph)
		}
	}
	return md, nil
}

// ExecuteQuery runs a SQL++ statement under the configured metrics scope.
func (c *Client) ExecuteQuery(ctx context.Context, query string) ([]map[string]interface{}, error) {
	if c.metricsScope == nil {
		return nil, fmt.Errorf("couchbase metrics is unavailable")
	}
	results, err := c.metricsScope.Query(query, &gocb.QueryOptions{Context: ctx, Timeout: queryTimeout})
	if err != nil {
		return nil, fmt.Errorf("execute query: %w", err)
	}
	defer results.Close()

	var rows []map[string]interface{}
	for results.Next() {
		var row map[string]interface{}
		if err := results.Row(&row); err != nil {
			continue
		}
		rows = append(rows, row)
	}
	if err := results.Err(); err != nil {
		return nil, fmt.Errorf("query error: %w", err)
	}
	return rows, nil
}

// Close releases the cluster connection.
func (c *Client) Close() error {
	if c.cluster != nil {
		return c.cluster.Close(nil)
	}
	return nil
}

// BuildConnectionString prepends the couchbase:// scheme to a bare host. A
// value that already carries a scheme (couchbase://, couchbases://) is
// returned unchanged.
func BuildConnectionString(host string) string {
	if host == "" {
		return ""
	}
	if strings.Contains(host, "://") {
		return host
	}
	return "couchbase://" + host
}
