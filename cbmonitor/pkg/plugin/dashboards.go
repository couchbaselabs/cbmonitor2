package plugin

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	sdklog "github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

//go:embed bundled-dashboards/*/*.json
var bundledDashboardsFS embed.FS

const bundledDashboardsRoot = "bundled-dashboards"

// dashboardReconcileTimeout caps a full bundled-dashboards pass. Generous
// since we may need to create a folder + upsert several dashboards.
const dashboardReconcileTimeout = 15 * time.Second

// BundledDashboard is one JSON file shipped inside the plugin binary. The
// directory immediately under bundled-dashboards/ becomes the Grafana folder title.
type BundledDashboard struct {
	Folder string          // e.g. "products"
	Name   string          // e.g. "couchbase-perf.json"
	UID    string          // parsed from the JSON's top-level "uid"
	Body   json.RawMessage // the dashboard JSON as-is
}

// DashboardReconcileStatus is the wire shape returned via
// /admin/reconcile-dashboards so the UI can surface outcomes.
type DashboardReconcileStatus struct {
	Status      string    `json:"status"` // "ok" | "skipped" | "error" | "pending" | "disabled"
	LastError   string    `json:"lastError,omitempty"`
	LastRunAt   time.Time `json:"lastRunAt,omitempty"`
	Bundled     []string  `json:"bundled"` // dashboard UIDs we ship
	Folders     []string  `json:"folders"` // folder titles we manage
	Created     []string  `json:"created,omitempty"`
	Updated     []string  `json:"updated,omitempty"`
	Skipped     []string  `json:"skipped,omitempty"`
	FolderUIDs  map[string]string `json:"folderUIDs,omitempty"` // title -> uid
}

// DashboardReconciler upserts dashboards bundled with the plugin into Grafana,
// placing each into a folder named after the dashboard's source directory.
// One reconciler per pass; constructed from the inbound request context so
// the plugin's service-account token is in scope.
type DashboardReconciler struct {
	httpClient *http.Client
	appURL     string
	saToken    string
}

// NewDashboardReconciler reads the plugin SA token and Grafana app URL from
// the inbound context. Returns a non-nil error when either is missing so
// the caller can surface a "skipped" status to the UI without blocking init.
func NewDashboardReconciler(ctx context.Context) (*DashboardReconciler, error) {
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
	return &DashboardReconciler{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		appURL:     strings.TrimRight(appURL, "/"),
		saToken:    token,
	}, nil
}

// LoadBundledDashboards walks the embedded FS and returns one entry per
// dashboard JSON. The directory immediately under bundled-dashboards/
// names the Grafana folder; the file's "uid" field is the dashboard UID.
func LoadBundledDashboards() ([]BundledDashboard, error) {
	var out []BundledDashboard
	err := fs.WalkDir(bundledDashboardsFS, bundledDashboardsRoot, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(d.Name(), ".json") {
			return nil
		}
		rel := strings.TrimPrefix(p, bundledDashboardsRoot+"/")
		parts := strings.SplitN(rel, "/", 2)
		if len(parts) != 2 {
			// File at the root of bundled-dashboards/ — skip (no folder).
			return nil
		}
		folder := parts[0]
		body, err := bundledDashboardsFS.ReadFile(p)
		if err != nil {
			return fmt.Errorf("read %s: %w", p, err)
		}
		var meta struct {
			UID string `json:"uid"`
		}
		if err := json.Unmarshal(body, &meta); err != nil {
			return fmt.Errorf("parse uid from %s: %w", p, err)
		}
		if meta.UID == "" {
			return fmt.Errorf("%s has empty top-level uid", p)
		}
		out = append(out, BundledDashboard{
			Folder: folder,
			Name:   path.Base(p),
			UID:    meta.UID,
			Body:   body,
		})
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// Reconcile creates each required folder (if missing) and upserts each
// bundled dashboard into it. Errors on individual dashboards are logged
// and accumulated; we never abort on the first failure.
func (r *DashboardReconciler) Reconcile(ctx context.Context, dashboards []BundledDashboard) DashboardReconcileStatus {
	ctx, cancel := context.WithTimeout(ctx, dashboardReconcileTimeout)
	defer cancel()

	status := DashboardReconcileStatus{
		Status:     "ok",
		LastRunAt:  time.Now(),
		FolderUIDs: map[string]string{},
	}

	// Collect distinct folder titles in the order we first see them.
	folderOrder := []string{}
	seenFolder := map[string]bool{}
	for _, d := range dashboards {
		status.Bundled = append(status.Bundled, d.UID)
		if !seenFolder[d.Folder] {
			folderOrder = append(folderOrder, d.Folder)
			seenFolder[d.Folder] = true
		}
	}
	status.Folders = folderOrder

	var errs []string

	// Phase 1: ensure each folder exists, capture its UID.
	for _, title := range folderOrder {
		uid, err := r.ensureFolder(ctx, title)
		if err != nil {
			errs = append(errs, fmt.Sprintf("folder %s: %v", title, err))
			sdklog.DefaultLogger.Error("cbmonitor dashboard folder ensure failed", "title", title, "error", err.Error())
			continue
		}
		status.FolderUIDs[title] = uid
	}

	// Phase 2: upsert each dashboard. Skip ones whose folder wasn't created
	// (we'd just hit a downstream error trying to import without a folder).
	for _, d := range dashboards {
		folderUID, ok := status.FolderUIDs[d.Folder]
		if !ok {
			status.Skipped = append(status.Skipped, d.UID)
			continue
		}
		created, err := r.upsertDashboard(ctx, d, folderUID)
		if err != nil {
			errs = append(errs, fmt.Sprintf("dashboard %s: %v", d.UID, err))
			sdklog.DefaultLogger.Error("cbmonitor dashboard upsert failed", "uid", d.UID, "error", err.Error())
			continue
		}
		if created {
			status.Created = append(status.Created, d.UID)
			sdklog.DefaultLogger.Info("cbmonitor created dashboard", "uid", d.UID, "folder", d.Folder)
		} else {
			status.Updated = append(status.Updated, d.UID)
			sdklog.DefaultLogger.Info("cbmonitor updated dashboard", "uid", d.UID, "folder", d.Folder)
		}
	}

	if len(errs) > 0 {
		status.Status = "error"
		status.LastError = strings.Join(errs, "; ")
	}
	return status
}

// ensureFolder returns the UID of a Grafana folder with the given title,
// creating it if it doesn't already exist. Uses the title as the UID for
// stability across plugin restarts.
func (r *DashboardReconciler) ensureFolder(ctx context.Context, title string) (string, error) {
	// Try GET /api/folders/<uid> first using the title-as-uid convention.
	uid := title
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.appURL+"/api/folders/"+uid, nil)
	if err != nil {
		return "", err
	}
	r.authorize(req)
	resp, err := r.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		return uid, nil
	}

	// Fall back to a title search across all folders — handles the case where
	// a folder with this title already exists with a different UID.
	listReq, err := http.NewRequestWithContext(ctx, http.MethodGet, r.appURL+"/api/folders", nil)
	if err != nil {
		return "", err
	}
	r.authorize(listReq)
	listResp, err := r.httpClient.Do(listReq)
	if err != nil {
		return "", err
	}
	defer listResp.Body.Close()
	if listResp.StatusCode == http.StatusOK {
		var folders []struct {
			UID   string `json:"uid"`
			Title string `json:"title"`
		}
		if err := json.NewDecoder(listResp.Body).Decode(&folders); err == nil {
			for _, f := range folders {
				if strings.EqualFold(f.Title, title) {
					return f.UID, nil
				}
			}
		}
	}

	// Create the folder.
	body := map[string]any{"uid": uid, "title": title}
	buf, _ := json.Marshal(body)
	createReq, err := http.NewRequestWithContext(ctx, http.MethodPost, r.appURL+"/api/folders", bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	createReq.Header.Set("Content-Type", "application/json")
	r.authorize(createReq)
	createResp, err := r.httpClient.Do(createReq)
	if err != nil {
		return "", err
	}
	defer createResp.Body.Close()
	if createResp.StatusCode >= 200 && createResp.StatusCode < 300 {
		var out struct{ UID string `json:"uid"` }
		if err := json.NewDecoder(createResp.Body).Decode(&out); err == nil && out.UID != "" {
			return out.UID, nil
		}
		return uid, nil
	}
	if createResp.StatusCode == http.StatusForbidden {
		return "", fmt.Errorf("forbidden (403) on POST /api/folders — check plugin iam.permissions includes folders:create: %s", readBodySnippet(createResp.Body))
	}
	return "", fmt.Errorf("create folder status %d: %s", createResp.StatusCode, readBodySnippet(createResp.Body))
}

// upsertDashboard imports a dashboard into the given folder. Returns
// created=true when the dashboard didn't exist beforehand. Idempotent —
// running twice with the same JSON is a no-op (or version bump).
func (r *DashboardReconciler) upsertDashboard(ctx context.Context, d BundledDashboard, folderUID string) (created bool, err error) {
	// Probe live state for the create/updated distinction in logs/status.
	probeReq, perr := http.NewRequestWithContext(ctx, http.MethodGet, r.appURL+"/api/dashboards/uid/"+d.UID, nil)
	if perr != nil {
		return false, perr
	}
	r.authorize(probeReq)
	probeResp, perr := r.httpClient.Do(probeReq)
	if perr != nil {
		return false, perr
	}
	exists := probeResp.StatusCode == http.StatusOK
	probeResp.Body.Close()

	// The dashboard JSON we ship doesn't include an `id` (that's a
	// Grafana-internal numeric). We send it verbatim under the `dashboard`
	// key; Grafana matches by `uid` and overwrites.
	body := map[string]any{
		"dashboard": json.RawMessage(d.Body),
		"folderUid": folderUID,
		"overwrite": true,
	}
	buf, mErr := json.Marshal(body)
	if mErr != nil {
		return false, mErr
	}
	req, rErr := http.NewRequestWithContext(ctx, http.MethodPost, r.appURL+"/api/dashboards/db", bytes.NewReader(buf))
	if rErr != nil {
		return false, rErr
	}
	req.Header.Set("Content-Type", "application/json")
	r.authorize(req)
	resp, doErr := r.httpClient.Do(req)
	if doErr != nil {
		return false, doErr
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return !exists, nil
	}
	if resp.StatusCode == http.StatusForbidden {
		return false, fmt.Errorf("forbidden (403) on POST /api/dashboards/db — check plugin iam.permissions includes dashboards:create/write: %s", readBodySnippet(resp.Body))
	}
	return false, fmt.Errorf("status %d: %s", resp.StatusCode, readBodySnippet(resp.Body))
}

func (r *DashboardReconciler) authorize(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+r.saToken)
	req.Header.Set("Accept", "application/json")
}
