module github.com/couchbase/cbmonitor/cmd/config-manager

go 1.24

require github.com/couchbase/cbmonitor/internal/config-manager v0.0.0

require (
	github.com/google/uuid v1.6.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace (
	github.com/couchbase/cbmonitor/internal/config-manager => ../../internal/config-manager
	github.com/couchbase/cbmonitor/pkg/config => ../../pkg/config
	github.com/couchbase/cbmonitor/pkg/couchbase => ../../pkg/couchbase
)
