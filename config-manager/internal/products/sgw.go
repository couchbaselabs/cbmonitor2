package products

// sgwProduct is the registry entry for self-managed Sync Gateway, where
// each node is scraped directly as its own static target. Capella App
// Services is the managed form — see appservice.go.
var sgwProduct = &Product{
	Name:              "syncgateway",
	DefaultStaticPath: "/metrics",
}

func init() {
	register(sgwProduct)
}
