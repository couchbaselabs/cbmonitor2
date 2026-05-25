package models

import "time"

// SnapshotRequest represents the payload for creating a snapshot
// Contains information about the cluster to be monitored
type SnapshotRequest struct {
	Configs     []ConfigObject `json:"configs"`
	Credentials Credentials    `json:"credentials"`
	Scheme      string         `json:"scheme,omitempty"`
	TimeStamp   time.Time      `json:"timestamp,omitempty"`
	Label       string         `json:"label,omitempty"`

	// Boolean opt-ins for the canned custom-panel presets owned by
	// config-manager. Each `true` flag expands into one entry in the
	// snapshot's `custom_panels` field via presets.BuildCustomPanels.
	Cbagent bool `json:"cbagent,omitempty"`
	Capella bool `json:"capella,omitempty"`
}

// Credentials for cluster authentication
// TODO: dont store credentials in the snapshot, find a better way
type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// SnapshotResponse represents the response after creating a snapshot
type SnapshotResponse struct {
	ID string `json:"id"`
}

// ConfigObject represents the configuration for each different config object type.
//
// `Product` identifies what's at the target so config-manager can decide how
// to scrape it. Only the literal value "couchbase" triggers the Couchbase-
// specific code paths (default SD URL pattern, /pools/nodes metadata
// collection); any other value (or blank, on a static target) is treated as
// "generic". The product itself is NOT propagated as a scrape label.
//
// `SDPath` is the discovery endpoint path appended to {scheme}://{host}:{port}
// when Type=="sd" AND Product != "couchbase" (e.g. "/sd/targets"). It must
// begin with "/" and may include a query string.
type ConfigObject struct {
	Hostnames []string `json:"hostnames"`
	Type      string   `json:"type,omitempty"`
	Port      int      `json:"port"`
	Product   string   `json:"product,omitempty"`
	SDPath    string   `json:"sd_path,omitempty"`
}

// DisplaySnapshot represents the snapshot structure for GET responses or display purposes
type DisplaySnapshot struct {
	Name      string    `json:"name"`
	Urls      []string  `json:"urls,omitempty"`
	Targets   []string  `json:"targets,omitempty"`
	TimeStamp time.Time `json:"timestamp"`
}

type Cluster struct {
	Name    string   `json:"name,omitempty"`
	UID     string   `json:"uid"`
	Targets []string `json:"targets,omitempty"`
}
