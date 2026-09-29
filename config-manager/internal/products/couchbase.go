package products

import (
	"context"
	"fmt"

	"github.com/couchbase/config-manager/internal/services"
)

// Couchbase is the product entry for Couchbase Server. It owns the
// hardcoded SD URL shape and delegates metadata collection to
// services.MetadataService (which still owns the /pools/nodes +
// /prometheus_sd_config HTTP calls).
var couchbaseProduct = &Product{
	Name: "couchbase",

	ResolveSDPath: func(scheme string, useAltAddresses bool) string {
		// Couchbase's SD endpoint returns the same targets regardless of
		// scheme; only the `port=` parameter changes the per-target port
		// the SD response advertises (insecure → 8091-style, secure →
		// 18091-style).
		portType := "insecure"
		if scheme == "https" {
			portType = "secure"
		}
		// The `network=` parameter controls whether default or alternate node addresses
		// are returned as SD targets (default -> default address, external -> alt address)
		// You would request alt addresses when nodes have private default addresses and public
		// alt addresses (e.g. in some cloud environments)
		network := "default"
		if useAltAddresses {
			network = "external"
		}
		return fmt.Sprintf("/prometheus_sd_config?port=%s&clusterLabels=uuidAndName&network=%s", portType, network)
	},

	// Couchbase has no notion of a "static" metrics path here — its
	// targets come exclusively from SD discovery. Left blank.
	DefaultStaticPath: "",

	GetMetadata: collectCouchbaseMetadata,
}

func init() {
	register(couchbaseProduct)
}

// couchbaseMetadata is shared across snapshots so its HTTP client reuses
// connections to the clusters.
var couchbaseMetadata = services.NewMetadataService()

// collectCouchbaseMetadata wraps services.MetadataService so the product
// registry owns the API surface while the HTTP plumbing stays in
// internal/services/metadata.go.
func collectCouchbaseMetadata(ctx context.Context, scheme, hostname string, port int, username, password string) (*Metadata, error) {
	md, err := couchbaseMetadata.CollectClusterMetadata(ctx, hostname, port, username, password, scheme)
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
