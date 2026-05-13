package services

import (
	"context"
	"fmt"
	"log"
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
	if err := bucket.WaitUntilReady(30*time.Second, nil); err != nil {
		return nil, fmt.Errorf("bucket not ready: %w", err)
	}

	log.Printf("Connected to Couchbase cluster: %s, bucket: %s, scope: %s", connectionString, bucketName, scopeName)

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

// Close closes the Couchbase connection
func (cs *CouchbaseService) Close() error {
	if cs.cluster != nil {
		return cs.cluster.Close(nil)
	}
	return nil
}
