package couchbase

import (
	"context"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"github.com/couchbase/gocb/v2"

	"github.com/couchbase/datasource-gateway/internal/logger"
)

const (
	queryTimeout = 30 * time.Second
	// Readiness is probed in the background and retried, so each probe stays
	// short and the gap between them keeps an unreachable cluster cheap.
	readyProbeTimeout  = 10 * time.Second
	readyRetryInterval = 15 * time.Second
)

// Config holds the Couchbase connection settings the gateway needs.
type Config struct {
	Enabled            bool
	ConnectionString   string // e.g. "couchbase://localhost"
	Username           string
	Password           string
	MetadataBucket     string // snapshot metadata keyspace
	MetadataScope      string
	MetadataCollection string
	MetricsBucket      string // metrics keyspace
	MetricsScope       string
	MetricsCollection  string
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

	metaBucket := cluster.Bucket(cfg.MetadataBucket)
	metricsBucket := cluster.Bucket(cfg.MetricsBucket)

	c.cluster = cluster
	c.metadataColl = metaBucket.
		Scope(orDefault(cfg.MetadataScope)).
		Collection(orDefault(cfg.MetadataCollection))
	c.metricsScope = metricsBucket.Scope(orDefault(cfg.MetricsScope))

	// Verify readiness in the background. gocb.Connect/Bucket do no network
	// I/O; only WaitUntilReady blocks. Keeping it off the startup path means
	// the gateway serves /healthz immediately and queries queue until ready.
	go c.waitUntilReady(metaBucket, metricsBucket)

	return c, nil
}

// waitUntilReady polls the buckets until they all become reachable. It keeps
// retrying because Couchbase routinely starts after the gateway (both in
// compose and on a host reboot); giving up on the first failure would pin
// Ready() false, and so /healthz for the life of the process.
func (c *Client) waitUntilReady(buckets ...*gocb.Bucket) {
	unique := make([]*gocb.Bucket, 0, len(buckets))
	seen := make(map[string]bool)
	for _, b := range buckets {
		if b == nil || seen[b.Name()] {
			continue
		}
		seen[b.Name()] = true
		unique = append(unique, b)
	}

	for {
		allReady := true
		for _, b := range unique {
			if err := b.WaitUntilReady(readyProbeTimeout, nil); err != nil {
				allReady = false
				break
			}
		}
		c.ready.Store(allReady)
		if allReady {
			return
		}
		time.Sleep(readyRetryInterval)
	}
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

// ExecuteQuery runs a SQL++ statement under the configured metrics scope,
// binding params as named query parameters so values never reach the statement text.
func (c *Client) ExecuteQuery(ctx context.Context, query string, params map[string]interface{}) ([]map[string]interface{}, error) {
	if c.metricsScope == nil {
		return nil, fmt.Errorf("couchbase metrics is unavailable")
	}
	results, err := c.metricsScope.Query(query, &gocb.QueryOptions{
		Context:         ctx,
		Timeout:         queryTimeout,
		NamedParameters: params,
	})
	if err != nil {
		return nil, fmt.Errorf("execute query: %w", err)
	}
	defer results.Close()

	var rows []map[string]interface{}
	var decodeErrs int
	for results.Next() {
		var row map[string]interface{}
		if err := results.Row(&row); err != nil {
			decodeErrs++
			continue
		}
		rows = append(rows, row)
	}
	if err := results.Err(); err != nil {
		return nil, fmt.Errorf("query error: %w", err)
	}
	if decodeErrs > 0 {
		// Undecodable rows silently shrink a panel's sample set, so make the
		// gap visible rather than reporting a clean success.
		logger.Warn("Skipped undecodable query rows", "skipped", decodeErrs, "returned", len(rows))
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

// orDefault maps an empty scope/collection name to "_default".
func orDefault(name string) string {
	if name == "" {
		return "_default"
	}
	return name
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
