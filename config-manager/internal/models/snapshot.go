package models

import "time"

// SnapshotRequest represents the payload for creating a snapshot
// Contains information about the cluster to be monitored
type SnapshotRequest struct {
	Configs     	[]ConfigObject    `json:"configs"`
	Credentials 	Credentials       `json:"credentials"`
	Scheme 			string			  `json:"scheme,omitempty"`
	TimeStamp   	time.Time         `json:"timestamp,omitempty"`
}

// Credentials for cluster authentication
// TODO: dont store credentials in the snapshot, find a better way
type Credentials struct {
	Username 	string 	`json:"username"`
	Password 	string 	`json:"password"`
}

// SnapshotResponse represents the response after creating a snapshot
type SnapshotResponse struct {
	ID        string    `json:"id"`
}

// ConfigObject represents the configuration for each different config object type
type ConfigObject struct {
	Hostnames 	[]string 	`json:"hostnames"`
	Type 		string  	`json:"type,omitempty"`
	Port 		int     	`json:"port"`
}

// DisplaySnapshot represents the snapshot structure for GET responses or display purposes
type DisplaySnapshot struct {
	Name      string    	`json:"name"`
	Urls      []string 		`json:"urls,omitempty"`
	Targets   []string 		`json:"targets,omitempty"`
	TimeStamp time.Time 	`json:"timestamp"`
}