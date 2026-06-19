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

// appManagedUIDs is the full set of datasource UIDs this reconciler owns.
// Any UID in this set that isn't in the current `desired` list during a
// reconcile pass gets DELETEd from Grafana — that's how toggling a
// feature off in app settings cleans up its datasource.
//
// dsUIDCouchbase is retained here even though desiredDatasources no longer
// produces it: the gateway replaced the standalone couchbase-datasource, so
// the reconciler must DELETE any pre-existing cbdatasource left over from
// before the gateway. Drop it (and the constant + IAM scopes) in a future
// release once deployments have reconciled it away.
var appManagedUIDs = []string{dsUIDPrometheus, dsUIDCouchbase}

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
// Grafana, then deletes any app-managed UID the user no longer wants
// (feature toggled off). Errors on individual datasources are logged and
// accumulated; reconciliation never aborts on the first failure.
//
// `claimed` is the set of app-managed UIDs the user has intent to
// provision but for which required config (URL, connection string) is
// currently missing. UIDs in `claimed` but absent from `desired` are
// skipped during the delete phase — that turns a deployer regression
// (e.g. missing $PROMETHEUS_URL) into a no-op instead of silently
// destroying a previously-good datasource. Pass nil to disable this
// protection (the existing test suite does so).
func (r *Reconciler) Reconcile(ctx context.Context, desired []DesiredDatasource, claimed map[string]bool) error {
	ctx, cancel := context.WithTimeout(ctx, reconcileTimeout)
	defer cancel()

	wanted := make(map[string]bool, len(desired))
	for _, d := range desired {
		wanted[d.UID] = true
	}

	var errs []string

	// Phase 1: create/update each datasource the user currently wants.
	for _, d := range desired {
		if err := r.reconcileOne(ctx, d); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", d.UID, err))
			sdklog.DefaultLogger.Error("cbmonitor datasource reconcile failed", "uid", d.UID, "error", err.Error())
		}
	}

	// Phase 2: delete any app-managed UID the user no longer wants. A 404
	// on the GET is fine (nothing to delete); a read-only finding refuses
	// to delete and surfaces the conflict. UIDs the user still intends to
	// provision but couldn't be reconciled (missing required config) are
	// left alone — see the `claimed` doc above.
	for _, uid := range appManagedUIDs {
		if wanted[uid] {
			continue
		}
		if claimed[uid] {
			sdklog.DefaultLogger.Warn("cbmonitor reconcile: skipping delete; feature enabled but required config missing", "uid", uid)
			continue
		}
		if err := r.deleteIfPresent(ctx, uid); err != nil {
			errs = append(errs, fmt.Sprintf("delete %s: %v", uid, err))
			sdklog.DefaultLogger.Error("cbmonitor datasource delete failed", "uid", uid, "error", err.Error())
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

// deleteIfPresent removes a datasource by UID, treating 404 as success
// (nothing to clean up). YAML-provisioned (readOnly) datasources are
// refused so we don't fight provisioning.
func (r *Reconciler) deleteIfPresent(ctx context.Context, uid string) error {
	live, err := r.getDatasource(ctx, uid)
	if err != nil {
		return fmt.Errorf("get: %w", err)
	}
	if live == nil {
		return nil // already gone — nothing to do
	}
	if live.ReadOnly {
		return fmt.Errorf("datasource %s is read-only (likely YAML-provisioned); refusing to delete", uid)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, r.appURL+"/api/datasources/uid/"+uid, nil)
	if err != nil {
		return err
	}
	r.authorize(req)
	resp, err := r.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		sdklog.DefaultLogger.Info("cbmonitor deleted orphan datasource", "uid", uid)
		return nil
	}
	if resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("forbidden (403) — check the plugin's iam.permissions block: %s", readBodySnippet(resp.Body))
	}
	return fmt.Errorf("status %d: %s", resp.StatusCode, readBodySnippet(resp.Body))
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

// claimedDatasources returns the set of app-managed UIDs the user has
// expressed intent to have provisioned, regardless of whether the
// required config (URL / connection string) is present. The reconciler
// uses this to distinguish "feature disabled — clean up the DS" from
// "feature enabled but misconfigured — leave the existing DS alone".
func (s *PluginSettings) claimedDatasources() map[string]bool {
	// cbdatasource is intentionally absent: it's retired, so it's never
	// "claimed" and the reconciler's delete phase always removes any leftover.
	return map[string]bool{
		dsUIDPrometheus: s.PrometheusDatasource.Enabled,
	}
}

// desiredDatasources translates the current PluginSettings into the
// reconciler's input. Returns an empty slice if no app-managed datasource
// is enabled or required URLs are missing — the caller should surface this
// as "skipped", not as a hard error.
func (s *PluginSettings) desiredDatasources() []DesiredDatasource {
	out := []DesiredDatasource{}

	// The single Prometheus-typed datasource points at the gateway sidecar when
	// the gateway is enabled (so it can translate Couchbase-backed snapshots and
	// serve overlap); otherwise straight at the upstream Prometheus/Mimir
	// (pure-Prometheus mode). Either way it's a prometheus-typed datasource
	// speaking the Prometheus HTTP API, so the jsonData below is unchanged.
	promURL := s.PrometheusDatasource.URL
	if s.Gateway.Enabled {
		promURL = s.Gateway.URL
	}
	if s.PrometheusDatasource.Enabled && promURL != "" {
		out = append(out, DesiredDatasource{
			UID:       dsUIDPrometheus,
			Name:      "Prometheus",
			Type:      "prometheus",
			Access:    "proxy",
			URL:       promURL,
			IsDefault: s.PrometheusDatasource.IsDefault,
			JSONData: map[string]any{
				"cacheLevel":        "High",
				"httpMethod":        "POST",
				"prometheusType":    "Mimir",
				"prometheusVersion": "2.9.1",
			},
		})
	}
	// cbdatasource is no longer created: Couchbase-backed snapshots are served
	// by the gateway (the prometheus DS above points at it). Any pre-existing
	// cbdatasource is orphan-deleted via appManagedUIDs.
	return out
}
