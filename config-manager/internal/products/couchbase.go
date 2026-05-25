package products

import (
	"fmt"

	"github.com/couchbase/config-manager/internal/services"
)

// Couchbase is the product entry for Couchbase Server. It owns the
// hardcoded SD URL shape and delegates metadata collection to
// services.MetadataService (which still owns the /pools/nodes +
// /prometheus_sd_config HTTP calls).
var couchbaseProduct = &Product{
	Name: "couchbase",

	ResolveSDPath: func(scheme string) string {
		// Couchbase's SD endpoint returns the same targets regardless of
		// scheme; only the `port=` parameter changes the per-target port
		// the SD response advertises (insecure → 8091-style, secure →
		// 18091-style).
		portType := "insecure"
		if scheme == "https" {
			portType = "secure"
		}
		return fmt.Sprintf("/prometheus_sd_config?port=%s&clusterLabels=uuidAndName", portType)
	},

	// Couchbase has no notion of a "static" metrics path here — its
	// targets come exclusively from SD discovery. Left blank.
	DefaultStaticPath: "",

	GetMetadata: collectCouchbaseMetadata,
}

func init() {
	register(couchbaseProduct)
}

// collectCouchbaseMetadata wraps services.MetadataService so the product
// registry owns the API surface while the HTTP plumbing stays in
// internal/services/metadata.go.
func collectCouchbaseMetadata(scheme, hostname string, port int, username, password string) (*Metadata, error) {
	svc := services.NewMetadataService()
	md, err := svc.CollectClusterMetadata(hostname, port, username, password, scheme)
	if err != nil {
		return nil, err
	}
	if md == nil {
		return nil, nil
	}
	return &Metadata{
		Services: md.Services,
		Clusters: md.Clusters,
		Server:   md.Server,
	}, nil
}
