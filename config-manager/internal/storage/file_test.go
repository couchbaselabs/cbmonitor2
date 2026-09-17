package storage

import (
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// clusterMap builds the untyped payload generateVMAgentConfig consumes.
func clusterMap(configs ...map[string]interface{}) map[string]interface{} {
	raw := make([]interface{}, len(configs))
	for i, c := range configs {
		raw[i] = c
	}
	return map[string]interface{}{
		"configs": raw,
		"credentials": map[string]interface{}{
			"username": "admin",
			"password": "secret",
		},
	}
}

func generate(t *testing.T, id string, configs ...map[string]interface{}) []map[string]interface{} {
	t.Helper()
	fs := NewFileStorage(t.TempDir())
	content, err := fs.generateVMAgentConfig(clusterMap(configs...), id)
	if err != nil {
		t.Fatalf("generateVMAgentConfig: %v", err)
	}
	var jobs []map[string]interface{}
	if err := yaml.Unmarshal(content, &jobs); err != nil {
		t.Fatalf("unmarshal generated config: %v\n%s", err, content)
	}
	return jobs
}

func jobNames(jobs []map[string]interface{}) []string {
	names := make([]string, 0, len(jobs))
	for _, j := range jobs {
		name, _ := j["job_name"].(string)
		names = append(names, name)
	}
	return names
}

func jobByName(t *testing.T, jobs []map[string]interface{}, name string) map[string]interface{} {
	t.Helper()
	for _, j := range jobs {
		if n, _ := j["job_name"].(string); n == name {
			return j
		}
	}
	t.Fatalf("no job named %q; have %v", name, jobNames(jobs))
	return nil
}

func TestSingleSchemeYieldsOneUnsuffixedJob(t *testing.T) {
	jobs := generate(t, "snap", map[string]interface{}{
		"hostnames": []string{"cb1"},
		"type":      "sd",
		"port":      8091,
		"product":   "couchbase",
		"scheme":    "http",
	})

	if len(jobs) != 1 {
		t.Fatalf("expected 1 job, got %v", jobNames(jobs))
	}
	if name, _ := jobs[0]["job_name"].(string); name != "snap" {
		t.Errorf("job_name = %q, want %q", name, "snap")
	}
	// A lone job is already named after the snapshot.
	if _, ok := jobs[0]["relabel_configs"]; ok {
		t.Error("single-job config should not carry relabel_configs")
	}
	if _, ok := jobs[0]["metric_relabel_configs"]; ok {
		t.Error("couchbase declares no metric_relabel_configs")
	}
}

func TestMixedSchemesSplitHTTPFirst(t *testing.T) {
	jobs := generate(t, "snap",
		map[string]interface{}{
			"hostnames": []string{"sgw1"},
			"type":      "static",
			"port":      4986,
			"product":   "syncgateway",
			"scheme":    "https",
		},
		map[string]interface{}{
			"hostnames": []string{"cb1"},
			"type":      "sd",
			"port":      8091,
			"product":   "couchbase",
			"scheme":    "http",
		},
	)

	want := []string{"snap-http", "snap-https"}
	if got := jobNames(jobs); !equal(got, want) {
		t.Fatalf("job names = %v, want %v", got, want)
	}
	for _, job := range jobs {
		rules, ok := job["relabel_configs"].([]interface{})
		if !ok || len(rules) != 1 {
			t.Fatalf("job %v missing the job-label rewrite", job["job_name"])
		}
		rule := rules[0].(map[string]interface{})
		if rule["target_label"] != "job" || rule["replacement"] != "snap" {
			t.Errorf("job %v rewrite = %v, want job->snap", job["job_name"], rule)
		}
	}
}

// App Services shares a scheme with Couchbase but must not share a job,
// or the couchbaseNode->instance rewrite would hit Couchbase's series.
func TestAppServiceGetsItsOwnJobWithMetricRelabel(t *testing.T) {
	jobs := generate(t, "snap",
		map[string]interface{}{
			"hostnames": []string{"cb1"},
			"type":      "sd",
			"port":      8091,
			"product":   "couchbase",
			"scheme":    "http",
		},
		map[string]interface{}{
			"hostnames": []string{"apps.example.com"},
			"type":      "static",
			"port":      4986,
			"product":   "appservice",
			"scheme":    "http",
		},
	)

	want := []string{"snap-http", "snap-http-appservice"}
	if got := jobNames(jobs); !equal(got, want) {
		t.Fatalf("job names = %v, want %v", got, want)
	}

	shared := jobByName(t, jobs, "snap-http")
	if _, ok := shared["metric_relabel_configs"]; ok {
		t.Error("the shared job must not inherit App Services' metric_relabel_configs")
	}
	if _, ok := shared["http_sd_configs"]; !ok {
		t.Error("the shared job should hold the couchbase SD target")
	}

	appsvc := jobByName(t, jobs, "snap-http-appservice")
	rules, ok := appsvc["metric_relabel_configs"].([]interface{})
	if !ok || len(rules) != 1 {
		t.Fatalf("appservice job metric_relabel_configs = %v", appsvc["metric_relabel_configs"])
	}
	rule := rules[0].(map[string]interface{})
	sources, _ := rule["source_labels"].([]interface{})
	if len(sources) != 1 || sources[0] != "couchbaseNode" {
		t.Errorf("source_labels = %v, want [couchbaseNode]", rule["source_labels"])
	}
	if rule["target_label"] != "instance" {
		t.Errorf("target_label = %v, want instance", rule["target_label"])
	}
	// `(.+)` leaves `instance` alone when couchbaseNode is absent.
	if rule["regex"] != "(.+)" {
		t.Errorf("regex = %v, want (.+)", rule["regex"])
	}
	if rule["replacement"] != "$1" {
		t.Errorf("replacement = %v, want $1", rule["replacement"])
	}
}

// A single job keeps the unsuffixed name and still carries its rules.
func TestAppServiceAloneKeepsSnapshotJobName(t *testing.T) {
	jobs := generate(t, "snap", map[string]interface{}{
		"hostnames": []string{"apps.example.com"},
		"type":      "static",
		"port":      4986,
		"product":   "appservice",
		"scheme":    "https",
	})

	if got := jobNames(jobs); !equal(got, []string{"snap"}) {
		t.Fatalf("job names = %v, want [snap]", got)
	}
	if _, ok := jobs[0]["metric_relabel_configs"]; !ok {
		t.Error("appservice job is missing its metric_relabel_configs")
	}
}

func TestGeneratedYAMLCarriesRelabelRule(t *testing.T) {
	fs := NewFileStorage(t.TempDir())
	content, err := fs.generateVMAgentConfig(clusterMap(map[string]interface{}{
		"hostnames": []string{"apps.example.com"},
		"type":      "static",
		"port":      4986,
		"product":   "appservice",
		"scheme":    "http",
	}), "snap")
	if err != nil {
		t.Fatalf("generateVMAgentConfig: %v", err)
	}
	if !strings.Contains(string(content), "couchbaseNode") {
		t.Errorf("generated config lost the relabel rule:\n%s", content)
	}
	t.Logf("generated:\n%s", content)
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
