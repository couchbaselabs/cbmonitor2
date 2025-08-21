package models

import "time"

// SnapshotRequest represents the payload for creating a snapshot
// Contains information about the cluster to be monitored
type SnapshotRequest struct {
	Name        string            `json:"name"`
	Hostname    string            `json:"hostname"`
	Port        int               `json:"port"`
	Credentials Credentials       `json:"credentials"`
	TimeStamp   time.Time         `json:"timestamp,omitempty"`
}

// Credentials for cluster authentication
// TODO: dont store credentials in the snapshot, find a better way
type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// SnapshotResponse represents the response after creating a snapshot
type SnapshotResponse struct {
	ID        string    `json:"id"`
}
