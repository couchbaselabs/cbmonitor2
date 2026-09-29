package main

import (
	"net/http"
	"time"
)

const (
	readHeaderTimeout = 10 * time.Second
	// Request bodies are small JSON documents.
	readTimeout = 30 * time.Second
	// Create still collects cluster metadata inline, one host at a time, so a
	// slow cluster can hold the response for over a minute. The limit matches
	// the on-prem proxy's 120s read timeout: cutting the connection sooner would
	// drop a create the server has already completed, and the client's retry
	// would register a duplicate snapshot.
	writeTimeout   = 120 * time.Second
	idleTimeout    = 60 * time.Second
	maxHeaderBytes = 1 << 20

	// shutdownTimeout bounds graceful shutdown, so one stuck request cannot
	// hold the process open after SIGTERM.
	shutdownTimeout = 10 * time.Second
)

// newHTTPServer builds the API server with every connection-level timeout set,
// so a slow or stalled client cannot hold a connection open indefinitely.
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
