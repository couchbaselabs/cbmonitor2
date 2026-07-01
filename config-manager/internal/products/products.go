// Package products is a small registry of "known products" config-manager
// can scrape. Each entry centralises the per-product quirks:
//
//   - the default service-discovery URL path (so callers don't need to
//     pass sd_path for known products)
//   - the default metrics path on static targets (stored for now; not
//     yet wired into the emitted vmagent YAML)
//   - a metadata fetcher (e.g. /pools/nodes for couchbase)
//
// Adding a new product is one file in this package; no other callers
// need to special-case it.
package products

import "github.com/couchbase/config-manager/internal/models"

// Product is one entry in the registry. All fields are optional — a
// product can support SD only, metadata only, neither, or both.
type Product struct {
	Name string

	// ResolveSDPath returns the URL path (and optional query string)
	// that completes a service-discovery URL. The full URL is built as
	// {scheme}://{host}:{port}{ResolveSDPath(scheme, useAltAddresses)}.
	// Return "" (or leave nil) to indicate the product has no default
	// SD path; the caller must then supply sd_path explicitly when
	// using type=sd.
	ResolveSDPath func(scheme string, useAltAddresses bool) string

	// DefaultStaticPath is the metrics path the product exposes on its
	// static targets (e.g. "/_expvar" for SGW). Recorded for future
	// wiring; today's vmagent YAML output ignores it.
	DefaultStaticPath string

	// GetMetadata performs product-specific metadata collection against
	// a single hostname. Returns (nil, nil) when there's nothing to
	// report (the handler treats that the same as "no fetcher").
	GetMetadata func(scheme, hostname string, port int, username, password string) (*Metadata, error)
}

// Metadata is the per-host result of GetMetadata. For backward
// compatibility with today's flat snapshot-metadata document, Services
// / Clusters / Server are surfaced as top-level fields on the persisted
// doc. Extras is a free-form blob that lands on the doc as-is so future
// products can ship arbitrary metadata without another model change.
type Metadata struct {
	Services []string
	Clusters []models.Cluster
	Server   string
	Extras   map[string]interface{}
}

// registry is the read-only set of known products. Each product file
// registers itself via the package-level `register(...)` helper so the
// map literal stays in one place.
var registry = map[string]*Product{}

// register adds a product to the registry. Intended for use only from
// init() blocks in this package's per-product files. Panics on a
// duplicate name so collisions are surfaced at startup, not at runtime.
func register(p *Product) {
	if p == nil || p.Name == "" {
		panic("products.register: nil or unnamed product")
	}
	if _, exists := registry[p.Name]; exists {
		panic("products.register: duplicate product " + p.Name)
	}
	registry[p.Name] = p
}

// Get returns the registry entry for `name`, or nil when unknown.
func Get(name string) *Product {
	return registry[name]
}
