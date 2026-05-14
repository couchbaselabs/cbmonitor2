package plugin

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/couchbase/cbmonitor/pkg/services"
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

	// settingsError captures any error LoadSettings returned during NewApp.
	// When non-empty the App is running on defaultSettings() — surface this
	// via /config/datasources so the UI can banner that user input was
	// rejected.
	settingsError string

	// Long-lived services owned by this App instance. nil when the
	// corresponding feature toggle is off or initialization failed. Closed
	// in Dispose().
	snapshotService  *services.SnapshotService
	couchbaseService *services.CouchbaseService

	reconcileOnce  sync.Once
	reconcileMu    sync.RWMutex
	reconcileState ReconcileStatus

	// reconcileCtx is the cancellation root for any goroutines App owns
	// (currently the lazy datasource reconcile pass). Dispose() calls
	// reconcileCancel before closing services, so background work observes
	// the shutdown rather than racing against torn-down state.
	reconcileCtx    context.Context
	reconcileCancel context.CancelFunc
}

// NewApp creates a new App instance, parsing the Grafana-managed plugin
// settings up front and opening any Couchbase connections required by the
// enabled features. Grafana disposes and re-creates the instance whenever
// settings change, so registered routes always reflect the latest config.
func NewApp(_ context.Context, instSettings backend.AppInstanceSettings) (instancemgmt.Instance, error) {
	var settingsErr string
	settings, err := LoadSettings(instSettings)
	if err != nil {
		sdklog.DefaultLogger.Warn("cbmonitor plugin settings invalid; using disabled-everything fallback", "error", err.Error())
		settingsErr = err.Error()
		settings = defaultSettings()
	}

	reconcileCtx, reconcileCancel := context.WithCancel(context.Background())

	app := &App{
		settings:        settings,
		settingsError:   settingsErr,
		reconcileCtx:    reconcileCtx,
		reconcileCancel: reconcileCancel,
		reconcileState: ReconcileStatus{
			Status:         "pending",
			AppManagedUIDs: []string{dsUIDPrometheus, dsUIDCouchbase},
		},
	}

	app.initServices()

	mux := http.NewServeMux()
	app.registerRoutes(mux)
	app.inner = httpadapter.New(mux)

	return app, nil
}

// initServices opens long-lived Couchbase connections for the enabled
// features. A service init failure leaves the corresponding field nil; the
// HTTP handlers are written to degrade gracefully in that case (return
// errors / mock data rather than crashing).
func (a *App) initServices() {
	cb := a.settings.CouchbaseServer

	if a.settings.Snapshots.Enabled {
		snap := a.settings.Snapshots
		sdklog.DefaultLogger.Info("initServices: opening Snapshot service",
			"bucket", snap.Bucket, "scope", snap.Scope, "collection", snap.Collection)
		s, err := services.NewSnapshotService(cb.ConnectionString, cb.Username, cb.Password, snap.Bucket, snap.Scope, snap.Collection)
		if err != nil {
			sdklog.DefaultLogger.Error("initServices: SnapshotService init failed", "error", err.Error())
		} else {
			a.snapshotService = s
		}
	}

	if a.settings.CouchbaseDatasource.Enabled {
		ds := a.settings.CouchbaseDatasource
		sdklog.DefaultLogger.Info("initServices: opening Couchbase metrics service",
			"bucket", ds.Bucket, "scope", ds.Scope)
		c, err := services.NewCouchbaseService(cb.ConnectionString, cb.Username, cb.Password, ds.Bucket, ds.Scope)
		if err != nil {
			sdklog.DefaultLogger.Error("initServices: CouchbaseService init failed", "error", err.Error())
		} else {
			a.couchbaseService = c
		}
	}
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
		// Parent on app.reconcileCtx so Dispose() can cancel the goroutine cleanly.
		bg := backend.WithGrafanaConfig(a.reconcileCtx, backend.GrafanaConfigFromContext(ctx))
		go a.reconcileNow(bg)
	})
	return a.inner.CallResource(ctx, req, sender)
}

// reconcileNow runs the reconciler synchronously and records the outcome.
// Safe to call multiple times; the lazy sync.Once gate above is the
// per-App-instance one-shot, while explicit admin invocations re-run via
// this path. Always invokes Reconcile, even when desired is empty — the
// reconciler's delete phase needs to run so toggling a feature off
// cleans up the orphaned datasource.
func (a *App) reconcileNow(ctx context.Context) {
	desired := a.settings.desiredDatasources()

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

// Dispose tears down resources owned by this App instance. Grafana calls
// this when settings change (the new App is created via NewApp). Order
// matters: cancel background work first, then close I/O.
func (a *App) Dispose() {
	if a.reconcileCancel != nil {
		a.reconcileCancel()
	}
	if a.snapshotService != nil {
		if err := a.snapshotService.Close(); err != nil {
			sdklog.DefaultLogger.Warn("Dispose: SnapshotService.Close error", "error", err.Error())
		}
		a.snapshotService = nil
	}
	if a.couchbaseService != nil {
		if err := a.couchbaseService.Close(); err != nil {
			sdklog.DefaultLogger.Warn("Dispose: CouchbaseService.Close error", "error", err.Error())
		}
		a.couchbaseService = nil
	}
}

// CheckHealth handles health checks sent from Grafana to the plugin.
func (a *App) CheckHealth(_ context.Context, _ *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "ok",
	}, nil
}
