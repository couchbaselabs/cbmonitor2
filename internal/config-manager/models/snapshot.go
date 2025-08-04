package models

// SnapshotRequest represents the payload for creating a snapshot
type SnapshotRequest struct {
	ClusterInfo ClusterInfo `json:"cluster_info"`
}

// ClusterInfo contains information about the Couchbase cluster
type ClusterInfo struct {
	Name        string            `json:"name"`
	Hostname    string            `json:"hostname"`
	Port        int               `json:"port"`
	Credentials Credentials       `json:"credentials"`
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
