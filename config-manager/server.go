package main

import (
	"net/http"
	"time"
)

const (
	readHeaderTimeout = 10 * time.Second
	// Request bodies are small JSON documents.
	readTimeout = 30 * time.Second
	// Handlers write one scrape file and one metadata document; cluster
	// metadata is collected after create responds.
	writeTimeout   = 30 * time.Second
	idleTimeout    = 60 * time.Second
	maxHeaderBytes = 1 << 20

	// shutdownTimeout bounds graceful shutdown, so one stuck request or
	// background metadata collection cannot hold the process open after SIGTERM.
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
