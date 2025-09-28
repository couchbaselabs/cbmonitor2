package models

import "time"

// ClusterMetadata represents the collected metadata from a Couchbase cluster
type ClusterMetadata struct {
	SnapshotID string    `json:"id"`
	Buckets    []string  `json:"buckets"`
	Nodes      []string  `json:"nodes"`
	Indexes    []string  `json:"indexes"`
	Timestamp  time.Time `json:"timestamp"`
}

// BucketInfo represents basic bucket information
type BucketInfo struct {
	Name string `json:"name"`
	Type string `json:"bucketType"`
}

// NodeInfo represents basic node information
type NodeInfo struct {
	Hostname string   `json:"hostname"`
	Services []string `json:"services"`

}

// IndexInfo represents basic index information
type IndexInfo struct {
	Name       string `json:"name"`
	KeyspaceID string `json:"keyspace_id"`
	Definition string `json:"definition"`
}
