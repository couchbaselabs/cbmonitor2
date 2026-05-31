package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	sdklog "github.com/grafana/grafana-plugin-sdk-go/backend/log"

	"github.com/couchbase/cbmonitor/pkg/models"
)

// phaseAnnotationTag tags every annotation this plugin writes, so a sync can
// find and replace only its own annotations without touching user-created ones.
const phaseAnnotationTag = "cbmonitor-phase"

// phasePaletteSize mirrors the builtin panel palette length (see
// SnapshotPhaseRegionsLayer). Each phase also gets a `phaseidx:<n>` tag where
// n = phaseIndex % phasePaletteSize. Product dashboards carry one annotation
// query per index, each with its own color, so phase colors line up with the
// builtin panels — a single tag query can only render one color.
const phasePaletteSize = 6

// annotationSyncTimeout caps a full phase-annotation sync (a list + several
// deletes + one create per phase).
const annotationSyncTimeout = 15 * time.Second

// phaseAnnotationSyncer writes a snapshot's phases into Grafana's org-level
// annotation store as region annotations, tagged "cbmonitor-phase" and
// "job:<snapshotID>" so native product dashboards can query them by the
// selected job. Constructed per request so the plugin service-account token
// is in scope, mirroring DashboardReconciler.
type phaseAnnotationSyncer struct {
	httpClient *http.Client
	appURL     string
	saToken    string
}

func newPhaseAnnotationSyncer(ctx context.Context) (*phaseAnnotationSyncer, error) {
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
	return &phaseAnnotationSyncer{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		appURL:     strings.TrimRight(appURL, "/"),
		saToken:    token,
	}, nil
}

func (s *phaseAnnotationSyncer) authorize(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+s.saToken)
	req.Header.Set("Accept", "application/json")
}

// annotationSyncResult is the wire shape returned via the sync endpoint.
type annotationSyncResult struct {
	SnapshotID string `json:"snapshotId"`
	Deleted    int    `json:"deleted"`
	Created    int    `json:"created"`
}

// sync replaces this snapshot's phase annotations: it removes the ones written
// by a prior sync (matched by the cbmonitor-phase + job tags) then creates one
// region annotation per phase with a parseable start and end. Idempotent — safe
// to call on every snapshot open.
func (s *phaseAnnotationSyncer) sync(ctx context.Context, snapshotID string, phases []models.Phase) (annotationSyncResult, error) {
	result := annotationSyncResult{SnapshotID: snapshotID}
	jobTag := "job:" + snapshotID

	existing, err := s.findExisting(ctx, jobTag)
	if err != nil {
		return result, err
	}
	for _, id := range existing {
		if err := s.delete(ctx, id); err != nil {
			sdklog.DefaultLogger.Warn("cbmonitor phase annotation delete failed", "id", id, "error", err.Error())
			continue
		}
		result.Deleted++
	}

	// Color by position in the phases array (matching the builtin layer, which
	// increments its palette index for every phase — including those skipped
	// here for lacking an end — so subsequent phases keep the same colors).
	for i, p := range phases {
		start, end, ok := parsePhaseWindow(p.TSStart, p.TSEnd)
		if !ok {
			continue
		}
		if err := s.create(ctx, start, end, p.Label, jobTag, i%phasePaletteSize); err != nil {
			sdklog.DefaultLogger.Warn("cbmonitor phase annotation create failed", "label", p.Label, "error", err.Error())
			continue
		}
		result.Created++
	}
	return result, nil
}

// findExisting returns the ids of annotations previously written for this job.
func (s *phaseAnnotationSyncer) findExisting(ctx context.Context, jobTag string) ([]int64, error) {
	q := url.Values{}
	q.Add("tags", phaseAnnotationTag)
	q.Add("tags", jobTag)
	q.Set("limit", "100")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.appURL+"/api/annotations?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	s.authorize(req)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("list annotations status %d: %s", resp.StatusCode, readBodySnippet(resp.Body))
	}
	var items []struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
		return nil, err
	}
	ids := make([]int64, 0, len(items))
	for _, it := range items {
		ids = append(ids, it.ID)
	}
	return ids, nil
}

func (s *phaseAnnotationSyncer) delete(ctx context.Context, id int64) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, fmt.Sprintf("%s/api/annotations/%d", s.appURL, id), nil)
	if err != nil {
		return err
	}
	s.authorize(req)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("delete annotation %d status %d", id, resp.StatusCode)
	}
	return nil
}

func (s *phaseAnnotationSyncer) create(ctx context.Context, start, end time.Time, label, jobTag string, colorIdx int) error {
	body := map[string]any{
		"time":    start.UnixMilli(),
		"timeEnd": end.UnixMilli(),
		"tags":    []string{phaseAnnotationTag, jobTag, fmt.Sprintf("phaseidx:%d", colorIdx)},
		"text":    label,
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.appURL+"/api/annotations", bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	s.authorize(req)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("forbidden (403) on POST /api/annotations — check plugin iam.permissions includes annotations:create: %s", readBodySnippet(resp.Body))
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("create annotation status %d: %s", resp.StatusCode, readBodySnippet(resp.Body))
	}
	return nil
}

// parsePhaseWindow parses phase ISO timestamps the same way the snapshot
// handler parses snapshot windows. Returns ok=false when either bound is empty
// or unparseable (e.g. a phase with no recorded end), in which case the phase
// contributes no zone.
func parsePhaseWindow(startStr, endStr string) (time.Time, time.Time, bool) {
	if startStr == "" || endStr == "" {
		return time.Time{}, time.Time{}, false
	}
	layouts := []string{time.RFC3339, time.RFC3339Nano, "2006-01-02T15:04:05"}
	parse := func(v string) (time.Time, bool) {
		for _, layout := range layouts {
			if t, err := time.Parse(layout, v); err == nil {
				return t, true
			}
		}
		return time.Time{}, false
	}
	start, ok1 := parse(startStr)
	end, ok2 := parse(endStr)
	if !ok1 || !ok2 {
		return time.Time{}, time.Time{}, false
	}
	return start, end, true
}

// handleSyncSnapshotAnnotations handles POST /snapshots/{id}/annotations/sync.
// It reads the snapshot's phases and (re)writes them into Grafana's annotation
// store so native product dashboards can render phase zones for the selected
// job. The write uses the plugin service-account token, so it works regardless
// of the viewing user's role.
func (a *App) handleSyncSnapshotAnnotations(w http.ResponseWriter, req *http.Request, snapshotID string) {
	if req.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if snapshotID == "" {
		http.Error(w, "snapshot id required", http.StatusBadRequest)
		return
	}
	if a.snapshotService == nil {
		http.Error(w, "snapshot service unavailable", http.StatusServiceUnavailable)
		return
	}

	ctx, cancel := context.WithTimeout(req.Context(), annotationSyncTimeout)
	defer cancel()

	snapshotData, err := a.snapshotService.GetSnapshotByID(ctx, snapshotID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "snapshot not found", http.StatusNotFound)
			return
		}
		http.Error(w, fmt.Sprintf("failed to fetch snapshot: %v", err), http.StatusInternalServerError)
		return
	}

	syncer, err := newPhaseAnnotationSyncer(ctx)
	if err != nil {
		sdklog.DefaultLogger.Warn("cbmonitor phase annotation sync skipped", "snapshot", snapshotID, "error", err.Error())
		http.Error(w, "annotation sync unavailable", http.StatusServiceUnavailable)
		return
	}

	result, err := syncer.sync(ctx, snapshotID, snapshotData.Metadata.Phases)
	if err != nil {
		sdklog.DefaultLogger.Error("cbmonitor phase annotation sync failed", "snapshot", snapshotID, "error", err.Error())
		http.Error(w, fmt.Sprintf("annotation sync failed: %v", err), http.StatusBadGateway)
		return
	}

	sdklog.DefaultLogger.Info("cbmonitor phase annotations synced", "snapshot", snapshotID, "created", result.Created, "deleted", result.Deleted)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(result); err != nil {
		sdklog.DefaultLogger.Error("cbmonitor phase annotation sync encode failed", "error", err.Error())
	}
}
