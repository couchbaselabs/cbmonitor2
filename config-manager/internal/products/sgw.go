package products

// sgwProduct is the registry entry for Sync Gateway. Today it only
// declares its expected metrics path; no SD discovery, no metadata fetcher.
var sgwProduct = &Product{
	Name:              "sgw",
	DefaultStaticPath: "/metrics",
}

func init() {
	register(sgwProduct)
}
