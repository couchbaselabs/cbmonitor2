package models

import "time"

// ClusterMetadata represents the collected metadata from a Couchbase cluster
type ClusterMetadata struct {
	SnapshotID string    `json:"id"`
	Services   []string  `json:"services"` // same thing for buckets and nodes for services 
	Server 	string    `json:"server,omitempty"`
	TsStart  time.Time `json:"timestamp"`
	TsEnd   time.Time `json:"ts_end,omitempty"`
	Phases  []Phase   `json:"phases,omitempty"`
}

type Phase struct {	
	Label   string `json:"label"` // can by any string so shouldnt need validation
	TsStart string `json:"ts_start,omitempty"`
	TsEnd   string `json:"ts_end,omitempty"` 		//the mode label of the pay;load will tell you which tsend or tsstart to update 
	// can either be "start" or "end", so add a validation thatif mdoe is neither sends and error about invalid mode
}

type PoolsDefault struct {	
	Nodes []NodeInfo `json:"nodes"`
}

type NodeInfo struct {
	Services []string `json:"services"`
	Server  string   `json:"version,omitempty"`
}
