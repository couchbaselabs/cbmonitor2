package services

import (
	"context"
	"fmt"
	"time"

	"github.com/couchbase/gocb/v2"
)

// ProbeCouchbaseBucket opens a fresh cluster connection, waits for the bucket
// to be ready with a SHORT timeout, and closes the cluster on return. Safe to
// call concurrently; never reuses long-lived state.
func ProbeCouchbaseBucket(_ context.Context, connStr, user, pass, bucket string, timeout time.Duration) error {
	cluster, err := gocb.Connect(connStr, gocb.ClusterOptions{
		Authenticator: gocb.PasswordAuthenticator{Username: user, Password: pass},
	})
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer cluster.Close(nil)

	b := cluster.Bucket(bucket)
	if err := b.WaitUntilReady(timeout, &gocb.WaitUntilReadyOptions{
		DesiredState: gocb.ClusterStateOnline,
	}); err != nil {
		return fmt.Errorf("bucket %q not ready: %w", bucket, err)
	}
	return nil
}
