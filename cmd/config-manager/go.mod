module github.com/couchbase/cbmonitor/cmd/config-manager

go 1.24

require (
	github.com/couchbase/cbmonitor/pkg/config v0.0.0
	github.com/couchbase/cbmonitor/pkg/couchbase v0.0.0
)

replace (
	github.com/couchbase/cbmonitor/pkg/config => ../../pkg/config
	github.com/couchbase/cbmonitor/pkg/couchbase => ../../pkg/couchbase
)
