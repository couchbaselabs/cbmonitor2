package models

import "time"

// SnapshotMetadata represents the collected metadata from a snapshot.
//
// Extras is a free-form per-snapshot blob populated from each known
// product's GetMetadata() return value. It rides on the same document
// for now; a future iteration may split product metadata into per-
// product sub-documents.
type SnapshotMetadata struct {
	SnapshotID   string                 `json:"id"`
	Services     []string               `json:"services"` // same thing for buckets and nodes for services
	Clusters     []Cluster              `json:"clusters,omitempty"`
	Server       string                 `json:"server,omitempty"`
	TsStart      time.Time              `json:"ts_start,omitempty"`
	TsEnd        string                 `json:"ts_end,omitempty"`
	Phases       []Phase                `json:"phases,omitempty"`
	Label        string                 `json:"label,omitempty"`
	CustomPanels []CustomPanelsConfig   `json:"custom_panels,omitempty"`
	Extras       map[string]interface{} `json:"extras,omitempty"`
	// Products is the distinct, order-preserving set of products this
	// snapshot scrapes, including any a product implies (e.g.
	// ["couchbase","syncgateway"], ["appservice","syncgateway"]).
	// cbmonitor uses it to decide whether the Couchbase baseline tabs apply.
	Products []string `json:"products,omitempty"`
}

// CustomPanelsConfig matches the shape cbmonitor's snapshot service
// parses out of the Couchbase document. Each entry becomes one "Custom"
// tab in the UI, with one panel per metric matching `Match`.
type CustomPanelsConfig struct {
	Title     string                         `json:"title,omitempty"`
	Match     string                         `json:"match"`
	RateMatch string                         `json:"rate_match,omitempty"`
	Overrides map[string]CustomPanelOverride `json:"overrides,omitempty"`
}

// CustomPanelOverride lets a preset customize a specific metric's panel
// (title, unit, rate-wrapping, legend) without listing every metric.
type CustomPanelOverride struct {
	Title             string `json:"title,omitempty"`
	Unit              string `json:"unit,omitempty"`
	TransformFunction string `json:"transformFunction,omitempty"`
	LegendFormat      string `json:"legendFormat,omitempty"`
}

type Phase struct {
	Label   string    `json:"label"`
	TsStart time.Time `json:"ts_start,omitempty"`
	TsEnd   string    `json:"ts_end,omitempty"`
}

// ApplyPhase records a phase starting or ending at at. Applying the same
// event again changes nothing, so a write that is retried after it already
// landed (an ambiguous timeout, or a restart before the queue recorded it as
// done) leaves no duplicate. An end closes the latest open phase with its
// label, or the latest phase when none has that label; in that case an end
// already recorded at the same time on any phase is the same end replayed.
func (md *SnapshotMetadata) ApplyPhase(label, mode string, at time.Time) {
	switch mode {
	case "start":
		for _, p := range md.Phases {
			if p.Label == label && p.TsStart.Equal(at) {
				return
			}
		}
		md.Phases = append(md.Phases, Phase{Label: label, TsStart: at})
	case "end":
		target := -1
		for i := len(md.Phases) - 1; i >= 0; i-- {
			p := md.Phases[i]
			if p.Label != label {
				continue
			}
			if end, err := time.Parse(time.RFC3339Nano, p.TsEnd); err == nil && end.Equal(at) {
				return
			}
			if p.TsEnd == "" && target < 0 {
				target = i
			}
		}
		if target < 0 {
			for _, p := range md.Phases {
				if end, err := time.Parse(time.RFC3339Nano, p.TsEnd); err == nil && end.Equal(at) {
					return
				}
			}
			target = len(md.Phases) - 1
		}
		if target >= 0 {
			md.Phases[target].TsEnd = at.Format(time.RFC3339Nano)
		}
	}
}

// MergeCollected merges cluster metadata collected after create into the
// document, keeping services a PATCH recorded meanwhile and any clusters and
// server version already set. Applying it again changes nothing.
func (md *SnapshotMetadata) MergeCollected(c *SnapshotMetadata) {
	md.MergeServices(c.Services)
	if len(md.Clusters) == 0 {
		md.Clusters = c.Clusters
	}
	if md.Server == "" {
		md.Server = c.Server
	}
	for k, v := range c.Extras {
		if md.Extras == nil {
			md.Extras = map[string]interface{}{}
		}
		md.Extras[k] = v
	}
}

// MergeServices appends the services not already recorded, keeping order, so
// applying the same list again changes nothing.
func (md *SnapshotMetadata) MergeServices(services []string) {
	seen := make(map[string]bool, len(md.Services)+len(services))
	for _, s := range md.Services {
		seen[s] = true
	}
	for _, s := range services {
		if !seen[s] {
			md.Services = append(md.Services, s)
			seen[s] = true
		}
	}
}

type PoolsDefault struct {
	Nodes []NodeInfo `json:"nodes"`
}

type NodeInfo struct {
	Services []string `json:"services"`
	Server   string   `json:"version,omitempty"`
}
