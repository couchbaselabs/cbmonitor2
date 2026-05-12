package plugin

import (
	"context"
	"net/http"

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
	backend.CallResourceHandler
	settings *PluginSettings
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

	app := &App{settings: settings}

	mux := http.NewServeMux()
	app.registerRoutes(mux)
	app.CallResourceHandler = httpadapter.New(mux)

	return app, nil
}

// Dispose here tells plugin SDK that plugin wants to clean up resources when a new instance
// created.
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
