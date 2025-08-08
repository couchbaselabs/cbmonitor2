module github.com/couchbase/cbmonitor/test

go 1.24

require github.com/couchbase/cbmonitor/internal/config-manager v0.0.0

require (
	github.com/google/uuid v1.6.0 // indirect
	github.com/kr/text v0.2.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace github.com/couchbase/cbmonitor/internal/config-manager => ../internal/config-manager
