package main

import (
	"net/http"
	"time"

	"github.com/couchbase/datasource-gateway/internal/cbeval"
)

const (
	readHeaderTimeout = 10 * time.Second
	// Requests are Prometheus API calls with form-encoded parameters.
	readTimeout = 30 * time.Second
	// The slowest handler evaluates a query over Couchbase Server samples,
	// which the engine bounds at cbeval.QueryTimeout; leave room to write the
	// result.
	writeTimeout   = cbeval.QueryTimeout + 30*time.Second
	idleTimeout    = 120 * time.Second
	maxHeaderBytes = 1 << 20

	// shutdownTimeout bounds graceful shutdown.
	shutdownTimeout = 10 * time.Second
)

// newHTTPServer builds the gateway's server with every connection-level
// timeout set, so a slow or stalled client cannot hold a connection open
// indefinitely.
func newHTTPServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
		MaxHeaderBytes:    maxHeaderBytes,
	}
}
