package services

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetMetadataEmptyNodeListIsAnErrorNotAPanic(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"nodes":[]}`))
	}))
	defer srv.Close()

	if _, _, err := NewMetadataService().GetMetadata(srv.URL, "u", "p"); err == nil {
		t.Fatal("expected an error for a cluster reporting no nodes")
	}
}

func TestGetMetadataCollectsServicesAndVersion(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"nodes":[{"services":["kv","n1ql"],"version":"8.0.0"},{"services":["kv","index"],"version":"8.0.0"}]}`))
	}))
	defer srv.Close()

	services, version, err := NewMetadataService().GetMetadata(srv.URL, "u", "p")
	if err != nil {
		t.Fatal(err)
	}
	if version != "8.0.0" || len(services) != 3 {
		t.Errorf("got services %v version %q, want 3 distinct services and 8.0.0", services, version)
	}
}
