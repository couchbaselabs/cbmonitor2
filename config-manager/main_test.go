package main

import (
	"net/http"
	"testing"
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

	// A write timeout below the proxy's would drop completed creates and
	// invite duplicate registrations on retry.
	if s.WriteTimeout < readTimeout {
		t.Errorf("WriteTimeout %v is shorter than ReadTimeout %v", s.WriteTimeout, s.ReadTimeout)
	}
}
