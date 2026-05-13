package plugin

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	sdklog "github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
)

// Make sure App implements required interfaces. This is important to do
// since otherwise we will only get a not implemented error response from plugin in
// runtime. Plugin should not implement all these interfaces - only those which are
// required for a particular task.
var (
	_ backend.CallResourceHandler   = (*App)(nil)
	_ instancemgmt.InstanceDisposer = (*App)(nil)
	_ backend.CheckHealthHandler    = (*App)(nil)
)

// App is the cbmonitor Grafana app backend.
type App struct {
	inner    backend.CallResourceHandler
	settings *PluginSettings

	reconcileOnce  sync.Once
	reconcileMu    sync.RWMutex
	reconcileState ReconcileStatus
}

// NewApp creates a new App instance, parsing the Grafana-managed plugin
// settings up front. Grafana disposes and re-creates the instance whenever
// settings change, so registered routes always reflect the latest config.
func NewApp(_ context.Context, instSettings backend.AppInstanceSettings) (instancemgmt.Instance, error) {
	settings, err := LoadSettings(instSettings)
	if err != nil {
		sdklog.DefaultLogger.Warn("cbmonitor plugin settings invalid; using disabled-everything fallback", "error", err.Error())
		settings = defaultSettings()
	}

	app := &App{
		settings: settings,
		reconcileState: ReconcileStatus{
			Status:         "pending",
			AppManagedUIDs: []string{dsUIDPrometheus, dsUIDCouchbase},
		},
	}

	mux := http.NewServeMux()
	app.registerRoutes(mux)
	app.inner = httpadapter.New(mux)

	return app, nil
}

// CallResource fans requests out to the inner mux, with one important
// side effect: the first call after each App re-instantiation kicks off
// datasource reconciliation in the background. Grafana re-creates the App
// on every settings save, so this gives us "reconcile on settings change"
// for free without polluting NewApp with API calls that require the
// per-request context.
func (a *App) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	a.reconcileOnce.Do(func() {
		// Detach from the request context (which is cancelled when the request returns),
		// but keep the Grafana config so the reconciler can read the SA token and app URL.
		bg := backend.WithGrafanaConfig(context.Background(), backend.GrafanaConfigFromContext(ctx))
		go a.reconcileNow(bg)
	})
	return a.inner.CallResource(ctx, req, sender)
}

// reconcileNow runs the reconciler synchronously and records the outcome.
// Safe to call multiple times; the lazy sync.Once gate above is the
// per-App-instance one-shot, while explicit admin invocations re-run via this path.
func (a *App) reconcileNow(ctx context.Context) {
	desired := a.settings.desiredDatasources()
	if len(desired) == 0 {
		a.setReconcileState(ReconcileStatus{
			Status:         "skipped",
			LastError:      "no app-managed datasources currently require reconciliation",
			LastRunAt:      time.Now(),
			AppManagedUIDs: []string{dsUIDPrometheus, dsUIDCouchbase},
		})
		return
	}

	r, err := NewReconciler(ctx)
	if err != nil {
		sdklog.DefaultLogger.Warn("cbmonitor datasource reconciliation disabled", "error", err.Error())
		a.setReconcileState(ReconcileStatus{
			Status:         "disabled",
			LastError:      err.Error(),
			LastRunAt:      time.Now(),
			AppManagedUIDs: []string{dsUIDPrometheus, dsUIDCouchbase},
		})
		return
	}

	if err := r.Reconcile(ctx, desired); err != nil {
		a.setReconcileState(ReconcileStatus{
			Status:         "error",
			LastError:      err.Error(),
			LastRunAt:      time.Now(),
			AppManagedUIDs: []string{dsUIDPrometheus, dsUIDCouchbase},
		})
		return
	}

	a.setReconcileState(ReconcileStatus{
		Status:         "ok",
		LastRunAt:      time.Now(),
		AppManagedUIDs: []string{dsUIDPrometheus, dsUIDCouchbase},
	})
}

func (a *App) setReconcileState(s ReconcileStatus) {
	a.reconcileMu.Lock()
	defer a.reconcileMu.Unlock()
	a.reconcileState = s
}

func (a *App) getReconcileState() ReconcileStatus {
	a.reconcileMu.RLock()
	defer a.reconcileMu.RUnlock()
	return a.reconcileState
}

// Dispose here tells plugin SDK that plugin wants to clean up resources when a new instance created.
func (a *App) Dispose() {
	// cleanup
}

// CheckHealth handles health checks sent from Grafana to the plugin.
func (a *App) CheckHealth(_ context.Context, _ *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "ok",
	}, nil
}
