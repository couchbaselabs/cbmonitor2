package couchbase

import "testing"

func TestBuildConnectionString(t *testing.T) {
	cases := []struct {
		host string
		want string
	}{
		{"", ""},
		{"localhost", "couchbase://localhost"},
		{"10.0.0.1,10.0.0.2", "couchbase://10.0.0.1,10.0.0.2"},
		{"couchbase://cluster.local", "couchbase://cluster.local"},
		{"couchbases://secure.local", "couchbases://secure.local"},
	}
	for _, c := range cases {
		if got := BuildConnectionString(c.host); got != c.want {
			t.Errorf("BuildConnectionString(%q) = %q, want %q", c.host, got, c.want)
		}
	}
}

func TestKeyspaceDefaultsEmptyScopeAndCollection(t *testing.T) {
	if got, want := Keyspace("cbmonitor", "", ""), "`cbmonitor`.`_default`.`_default`"; got != want {
		t.Errorf("Keyspace = %s, want %s", got, want)
	}
	if got, want := Keyspace("cbmonitor", "s", "c"), "`cbmonitor`.`s`.`c`"; got != want {
		t.Errorf("Keyspace = %s, want %s", got, want)
	}
}
