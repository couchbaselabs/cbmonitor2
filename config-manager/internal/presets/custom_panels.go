// Package presets owns the canned "custom_panels" templates that
// config-manager expands when a caller (perfrunner) passes a boolean
// opt-in on the SnapshotRequest. Each preset corresponds to one tab in
// the cbmonitor UI; the request's flags decide which presets land in
// the snapshot's metadata document.
package presets

import "github.com/couchbase/config-manager/internal/models"

// Cbagent renders perfrunner's general cluster-agent metrics. Refine
// match / rate_match / overrides as the cbagent metric inventory
// stabilizes.
var Cbagent = models.CustomPanelsConfig{
	Title:     "cbagent",
	Match:     "cbagent_.*",
	RateMatch: ".*_total",
}

// Capella renders perfrunner metrics specific to Capella-targeted runs.
var Capella = models.CustomPanelsConfig{
	Title:     "Capella",
	Match:     "capella_.*",
	RateMatch: ".*_total",
}

// BuildCustomPanels turns the SnapshotRequest's preset flags into the
// ordered slice that lands in `SnapshotMetadata.CustomPanels`. Order is
// stable: cbagent first when set, then capella. Returns nil when no
// flag is set so the JSON `custom_panels` field is omitted entirely.
func BuildCustomPanels(req *models.SnapshotRequest) []models.CustomPanelsConfig {
	if req == nil {
		return nil
	}
	var out []models.CustomPanelsConfig
	if req.Cbagent {
		out = append(out, Cbagent)
	}
	if req.Capella {
		out = append(out, Capella)
	}
	return out
}
