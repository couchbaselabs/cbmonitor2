package models

import (
	"reflect"
	"testing"
)

func TestMergeServicesAddsOnlyNewServicesInOrder(t *testing.T) {
	md := &SnapshotMetadata{Services: []string{"kv", "n1ql"}}
	md.MergeServices([]string{"index", "kv", "fts", "index"})
	md.MergeServices([]string{"index", "kv", "fts", "index"})

	want := []string{"kv", "n1ql", "index", "fts"}
	if !reflect.DeepEqual(md.Services, want) {
		t.Errorf("services = %v, want %v", md.Services, want)
	}
}
