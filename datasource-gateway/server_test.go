package main

import (
	"net/http"
	"testing"

	"github.com/couchbase/datasource-gateway/internal/cbeval"
)

func TestHTTPServerSetsEveryTimeout(t *testing.T) {
	s := newHTTPServer(":0", http.NewServeMux())

	for name, got := range map[string]int64{
		"ReadHeaderTimeout": int64(s.ReadHeaderTimeout),
		"ReadTimeout":       int64(s.ReadTimeout),
		"WriteTimeout":      int64(s.WriteTimeout),
		"IdleTimeout":       int64(s.IdleTimeout),
		"MaxHeaderBytes":    int64(s.MaxHeaderBytes),
	} {
		if got <= 0 {
			t.Errorf("%s is unset; a stalled client could hold a connection open indefinitely", name)
		}
	}

	// A write timeout below the engine's would cut off a Couchbase Server
	// query the engine still allows.
	if s.WriteTimeout <= cbeval.QueryTimeout {
		t.Errorf("WriteTimeout %v does not exceed the query timeout %v", s.WriteTimeout, cbeval.QueryTimeout)
	}
}
