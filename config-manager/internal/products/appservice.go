package products

// appserviceProduct is the registry entry for Capella App Services:
// managed Sync Gateway behind one metrics endpoint for the whole
// deployment. Every node is scraped through that endpoint, so `instance`
// identifies the endpoint rather than the node; the rule below promotes
// the per-node `couchbaseNode` label into `instance`.
//
// `regex: (.+)` does not match an empty source label, so a target
// without `couchbaseNode` keeps the `instance` it was scraped with.
var appserviceProduct = &Product{
	Name:              "appservice",
	DefaultStaticPath: "/metrics",

	// App Services is Sync Gateway, so its dashboards and tabs apply.
	Implies: []string{"syncgateway"},

	MetricRelabelConfigs: []RelabelRule{
		{
			SourceLabels: []string{"couchbaseNode"},
			Regex:        "(.+)",
			TargetLabel:  "instance",
			Replacement:  "$1",
		},
	},
}

func init() {
	register(appserviceProduct)
}
