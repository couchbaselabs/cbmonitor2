package models

import "time"

// SnapshotMetadata represents the collected metadata from a snapshot
type SnapshotMetadata struct {
	SnapshotID 	string    	`json:"id"`
	Services   	[]string  	`json:"services"` // same thing for buckets and nodes for services 
	Server 		string    	`json:"server,omitempty"`
	TsStart  	time.Time 	`json:"ts_start,omitempty"`
	TsEnd   	string 		`json:"ts_end,omitempty"`
	Phases  	[]Phase   	`json:"phases,omitempty"`
}

type Phase struct {	
	Label   	string    	`json:"label"`
	TsStart 	time.Time 	`json:"ts_start,omitempty"`
	TsEnd   	string    	`json:"ts_end,omitempty"` 
}

type PoolsDefault struct {	
	Nodes 	[]NodeInfo 	`json:"nodes"`
}

type NodeInfo struct {
	Services 	[]string 	`json:"services"`
	Server 		string  	`json:"version,omitempty"`
}
