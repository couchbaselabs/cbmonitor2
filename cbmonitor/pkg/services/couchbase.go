package services

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/couchbase/gocb/v2"
)

// CouchbaseService handles all Couchbase database operations
type CouchbaseService struct {
	cluster *gocb.Cluster
	bucket  *gocb.Bucket
	scope *gocb.Scope
}

// NewCouchbaseService creates a new Couchbase service instance. An empty scopeName falls back to "_default".
func NewCouchbaseService(connectionString, username, password, bucketName, scopeName string) (*CouchbaseService, error) {
	if scopeName == "" {
		scopeName = "_default"
	}

	cluster, err := gocb.Connect(connectionString, gocb.ClusterOptions{
		Authenticator: gocb.PasswordAuthenticator{
			Username: username,
			Password: password,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Couchbase cluster: %w", err)
	}

	bucket := cluster.Bucket(bucketName)

	// Verify readiness in the background rather than blocking the caller —
	// see NewSnapshotService for why.
	go func() {
		if err := bucket.WaitUntilReady(30*time.Second, nil); err != nil {
			log.Printf("Couchbase service: bucket %q not ready within 30s: %v", bucketName, err)
			return
		}
		log.Printf("Connected to Couchbase cluster: %s, bucket: %s, scope: %s", connectionString, bucketName, scopeName)
	}()

	return &CouchbaseService{
		cluster: cluster,
		bucket:  bucket,
		scope:   bucket.Scope(scopeName),
	}, nil
}

// ExecuteQuery runs a raw SQL++ query under the configured scope and
// returns each row as a generic map. The PromQL → SQL++ planner in
// pkg/promql is the sole caller.
func (cs *CouchbaseService) ExecuteQuery(ctx context.Context, query string) ([]map[string]interface{}, error) {
	results, err := cs.scope.Query(query, &gocb.QueryOptions{
		Context: ctx,
		Timeout: 30 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}
	defer results.Close()

	var rows []map[string]interface{}
	for results.Next() {
		var row map[string]interface{}
		if err := results.Row(&row); err != nil {
			log.Printf("Error parsing query row: %v", err)
			continue
		}
		rows = append(rows, row)
	}

	if err := results.Err(); err != nil {
		return nil, fmt.Errorf("query execution error: %w", err)
	}

	return rows, nil
}

// ListMetricNames returns distinct metric_name values stored in the
// configured scope for the given snapshot/job. If nameRegex is non-empty,
// only metric names matching that POSIX regex are returned. Results are
// returned alphabetically.
func (cs *CouchbaseService) ListMetricNames(ctx context.Context, snapshotID, nameRegex string) ([]string, error) {
	if snapshotID == "" {
		return nil, fmt.Errorf("snapshotID is required")
	}

	// SQL++ string literal escape: double single-quotes.
	escapedJob := strings.ReplaceAll(snapshotID, "'", "''")
	where := fmt.Sprintf("d.labels.job = '%s'", escapedJob)
	if nameRegex != "" {
		escapedRegex := strings.ReplaceAll(nameRegex, "'", "''")
		where = fmt.Sprintf("%s AND REGEXP_MATCHES(d.metric_name, '%s')", where, escapedRegex)
	}

	query := fmt.Sprintf(
		"SELECT DISTINCT RAW d.metric_name FROM cbmonitor._default._default AS d WHERE %s ORDER BY d.metric_name",
		where,
	)

	results, err := cs.scope.Query(query, &gocb.QueryOptions{
		Context: ctx,
		Timeout: 30 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}
	defer results.Close()

	var names []string
	for results.Next() {
		var name string
		if err := results.Row(&name); err != nil {
			log.Printf("Error parsing metric name row: %v", err)
			continue
		}
		if name != "" {
			names = append(names, name)
		}
	}
	if err := results.Err(); err != nil {
		return nil, fmt.Errorf("query execution error: %w", err)
	}

	return names, nil
}

// Close closes the Couchbase connection
func (cs *CouchbaseService) Close() error {
	if cs.cluster != nil {
		return cs.cluster.Close(nil)
	}
	return nil
}
