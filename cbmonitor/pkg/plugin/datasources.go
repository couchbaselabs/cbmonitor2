package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	sdklog "github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// App-managed datasource UIDs. These must match the values hardcoded in the
// frontend at src/constants.ts; the reconciler is the single writer.
const (
	dsUIDPrometheus = "prometheus"
	dsUIDCouchbase  = "cbdatasource"
)

// reconcileTimeout caps a single reconciliation pass. Long enough to handle
// a few HTTP retries against a slow Grafana, short enough that a wedged
// Grafana doesn't stall the plugin's first request indefinitely.
const reconcileTimeout = 10 * time.Second

// DesiredDatasource is the reconciler's intent for a single datasource. The
// reconciler creates the datasource if missing, updates it if the live
// definition differs, and leaves it alone otherwise.
type DesiredDatasource struct {
	UID       string
	Name      string
	Type      string
	Access    string // always "proxy"
	URL       string
	IsDefault bool
	JSONData  map[string]any
	// Secrets sent only when non-empty. Empty values are skipped so a PUT
	// never clobbers a Grafana-managed secret.
	SecureJSONData map[string]string
}

// ReconcileStatus is the wire shape returned to the frontend via
// /config/datasources so the UI can surface reconciliation health.
type ReconcileStatus struct {
	Status         string    `json:"status"` // "ok" | "skipped" | "error" | "pending" | "disabled"
	LastError      string    `json:"lastError,omitempty"`
	LastRunAt      time.Time `json:"lastRunAt,omitempty"`
	AppManagedUIDs []string  `json:"appManagedUIDs"`
}

// Reconciler talks to Grafana's HTTP API using the plugin's service account
// bearer token. One reconciler is constructed per App instance; the App's
// lifecycle (Grafana re-instantiates on every settings change) is the
// trigger for fresh reconciliation.
type Reconciler struct {
	httpClient *http.Client
	appURL     string
	saToken    string
}

// NewReconciler reads the plugin SA token and Grafana app URL from the
// inbound context. Returns a non-nil error when either is missing so the
// caller can surface a "skipped" status to the UI without blocking init.
func NewReconciler(ctx context.Context) (*Reconciler, error) {
	cfg := backend.GrafanaConfigFromContext(ctx)
	if cfg == nil {
		return nil, errors.New("grafana config missing from context")
	}
	token, err := cfg.PluginAppClientSecret()
	if err != nil || token == "" {
		return nil, fmt.Errorf("plugin service account token unavailable: %w", err)
	}
	appURL, err := cfg.AppURL()
	if err != nil || appURL == "" {
		return nil, fmt.Errorf("grafana app URL unavailable: %w", err)
	}
	return &Reconciler{
		httpClient: &http.Client{Timeout: 5 * time.Second},
		appURL:     strings.TrimRight(appURL, "/"),
		saToken:    token,
	}, nil
}

// Reconcile drives each desired datasource toward the live state in
// Grafana. Errors on individual datasources are logged and accumulated;
// reconciliation never aborts on the first failure.
func (r *Reconciler) Reconcile(ctx context.Context, desired []DesiredDatasource) error {
	ctx, cancel := context.WithTimeout(ctx, reconcileTimeout)
	defer cancel()

	var errs []string
	for _, d := range desired {
		if err := r.reconcileOne(ctx, d); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", d.UID, err))
			sdklog.DefaultLogger.Error("cbmonitor datasource reconcile failed", "uid", d.UID, "error", err.Error())
		}
	}
	if len(errs) > 0 {
		return errors.New(strings.Join(errs, "; "))
	}
	return nil
}

func (r *Reconciler) reconcileOne(ctx context.Context, d DesiredDatasource) error {
	if d.URL == "" {
		return fmt.Errorf("refusing to reconcile %s with empty URL", d.UID)
	}

	live, err := r.getDatasource(ctx, d.UID)
	if err != nil {
		return fmt.Errorf("get: %w", err)
	}

	if live == nil {
		if err := r.createDatasource(ctx, d); err != nil {
			return fmt.Errorf("create: %w", err)
		}
		sdklog.DefaultLogger.Info("cbmonitor created datasource", "uid", d.UID)
		return nil
	}

	if live.ReadOnly {
		return fmt.Errorf("datasource %s is read-only (likely YAML-provisioned); remove it from provisioning/datasources/datasource.yaml so the cbmonitor app can manage it", d.UID)
	}

	if datasourceEqual(live, d) {
		return nil
	}

	if err := r.updateDatasource(ctx, d); err != nil {
		return fmt.Errorf("update: %w", err)
	}
	sdklog.DefaultLogger.Info("cbmonitor updated datasource", "uid", d.UID)
	return nil
}

// liveDatasource is the subset of Grafana's datasource representation the
// reconciler cares about. Fields not listed here are passed through
// untouched when we don't issue a PUT.
type liveDatasource struct {
	ID        int64          `json:"id"`
	UID       string         `json:"uid"`
	OrgID     int64          `json:"orgId"`
	Name      string         `json:"name"`
	Type      string         `json:"type"`
	Access    string         `json:"access"`
	URL       string         `json:"url"`
	IsDefault bool           `json:"isDefault"`
	JSONData  map[string]any `json:"jsonData"`
	ReadOnly  bool           `json:"readOnly"`
}

// datasourceEqual reports whether the desired state matches the live state
// closely enough to skip an update. Secrets aren't compared (Grafana never
// returns them); a fresh password is delivered to the reconciler by the
// AppConfig save flow on the same path that re-instantiates this App, so
// the secret-set case naturally falls into the "settings changed" path.
func datasourceEqual(live *liveDatasource, d DesiredDatasource) bool {
	if live.Name != d.Name || live.Type != d.Type || live.Access != d.Access ||
		live.URL != d.URL || live.IsDefault != d.IsDefault {
		return false
	}
	return jsonDataEqual(live.JSONData, d.JSONData)
}

func jsonDataEqual(live map[string]any, desired map[string]any) bool {
	// Grafana echoes back additional bookkeeping fields (e.g. version) in
	// jsonData. Treat live as a superset: every desired key must exist
	// with the same value, but extra keys on live are fine.
	for k, v := range desired {
		lv, ok := live[k]
		if !ok {
			return false
		}
		if !reflect.DeepEqual(lv, v) {
			return false
		}
	}
	return true
}

func (r *Reconciler) getDatasource(ctx context.Context, uid string) (*liveDatasource, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.appURL+"/api/datasources/uid/"+uid, nil)
	if err != nil {
		return nil, err
	}
	r.authorize(req)
	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, readBodySnippet(resp.Body))
	}
	var live liveDatasource
	if err := json.NewDecoder(resp.Body).Decode(&live); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return &live, nil
}

func (r *Reconciler) createDatasource(ctx context.Context, d DesiredDatasource) error {
	body := datasourceWireBody(d)
	return r.doMutation(ctx, http.MethodPost, r.appURL+"/api/datasources", body)
}

func (r *Reconciler) updateDatasource(ctx context.Context, d DesiredDatasource) error {
	body := datasourceWireBody(d)
	// UID is immutable, omit from PUT body (it goes in the path).
	delete(body, "uid")
	return r.doMutation(ctx, http.MethodPut, r.appURL+"/api/datasources/uid/"+d.UID, body)
}

func datasourceWireBody(d DesiredDatasource) map[string]any {
	body := map[string]any{
		"uid":       d.UID,
		"name":      d.Name,
		"type":      d.Type,
		"access":    d.Access,
		"url":       d.URL,
		"isDefault": d.IsDefault,
		"jsonData":  d.JSONData,
	}
	if len(d.SecureJSONData) > 0 {
		// Only forward secret fields with non-empty values; an empty
		// string would clear a previously-set secret on Grafana's side.
		filtered := map[string]string{}
		for k, v := range d.SecureJSONData {
			if v != "" {
				filtered[k] = v
			}
		}
		if len(filtered) > 0 {
			body["secureJsonData"] = filtered
		}
	}
	return body
}

func (r *Reconciler) doMutation(ctx context.Context, method, url string, body map[string]any) error {
	buf, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	r.authorize(req)
	resp, err := r.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	if resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("forbidden (403) — check the plugin's iam.permissions block in plugin.json: %s", readBodySnippet(resp.Body))
	}
	return fmt.Errorf("status %d: %s", resp.StatusCode, readBodySnippet(resp.Body))
}

func (r *Reconciler) authorize(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+r.saToken)
	req.Header.Set("Accept", "application/json")
}

func readBodySnippet(body io.Reader) string {
	const max = 512
	buf, _ := io.ReadAll(io.LimitReader(body, max))
	return strings.TrimSpace(string(buf))
}

// desiredDatasources translates the current PluginSettings into the
// reconciler's input. Returns an empty slice if no app-managed datasource
// is enabled or required URLs are missing — the caller should surface this
// as "skipped", not as a hard error.
func (s *PluginSettings) desiredDatasources() []DesiredDatasource {
	out := []DesiredDatasource{}
	if s.PrometheusDatasource.Enabled && s.PrometheusDatasource.URL != "" {
		out = append(out, DesiredDatasource{
			UID:       dsUIDPrometheus,
			Name:      "Prometheus",
			Type:      "prometheus",
			Access:    "proxy",
			URL:       s.PrometheusDatasource.URL,
			IsDefault: s.PrometheusDatasource.IsDefault,
			JSONData: map[string]any{
				"cacheLevel":        "High",
				"httpMethod":        "POST",
				"prometheusType":    "Mimir",
				"prometheusVersion": "2.9.1",
			},
		})
	}
	if s.CouchbaseDatasource.Enabled && s.CouchbaseServer.ConnectionString != "" {
		out = append(out, DesiredDatasource{
			UID:    dsUIDCouchbase,
			Name:   "cbdatasource",
			Type:   "couchbase-datasource",
			Access: "proxy",
			// The couchbase-datasource plugin reads `host` from jsonData,
			// not the top-level `url` — but Grafana's API requires `url`
			// to be set on all datasources. Send the connection string in
			// both so the wire object is well-formed.
			URL: s.CouchbaseServer.ConnectionString,
			JSONData: map[string]any{
				"host":     s.CouchbaseServer.ConnectionString,
				"username": s.CouchbaseServer.Username,
			},
			SecureJSONData: map[string]string{
				"password": s.CouchbaseServer.Password,
			},
		})
	}
	return out
}
