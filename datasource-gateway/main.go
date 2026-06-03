package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/couchbase/datasource-gateway/internal/api"
	"github.com/couchbase/datasource-gateway/internal/config"
	"github.com/couchbase/datasource-gateway/internal/couchbase"
	"github.com/couchbase/datasource-gateway/internal/logger"
	"github.com/couchbase/datasource-gateway/internal/prometheus"
	"github.com/couchbase/datasource-gateway/internal/router"
)

const shutdownTimeout = 10 * time.Second

func main() {
	var configPath string
	flag.StringVar(&configPath, "config", "", "Path to the configuration file")
	flag.Parse()

	// Collect any remaining "section.field=value" args as dot-notation overrides.
	flagOverrides := make(map[string]string)
	for _, arg := range flag.Args() {
		if strings.Contains(arg, "=") {
			parts := strings.SplitN(arg, "=", 2)
			if len(parts) == 2 {
				flagName := strings.TrimLeft(parts[0], "-")
				flagOverrides[flagName] = parts[1]
			}
		}
	}

	cfg, err := config.LoadConfig(configPath, flagOverrides)
	if err != nil {
		logger.GetLogger().Error("Failed to load configuration", "error", err)
		os.Exit(1)
	}

	logger.InitLogger(cfg.Logging.Level)

	logger.Info("datasource-gateway starting...")
	logger.Info("Configuration loaded",
		"server_host", cfg.Server.Host,
		"server_port", cfg.Server.Port,
		"logging_level", cfg.Logging.Level,
		"prometheus_url", cfg.Prometheus.URL,
		"couchbase_enabled", cfg.Couchbase.Enabled,
		"couchbase_host", cfg.Couchbase.Host,
		"couchbase_metadata_bucket", cfg.Couchbase.MetadataBucket,
		"couchbase_metrics_bucket", cfg.Couchbase.MetricsBucket,
	)

	// Upstream Prometheus client (passthrough path) — always constructed.
	promClient := prometheus.New(cfg.Prometheus.URL)

	// Couchbase client (metadata + metrics). Non-blocking: a connect error or
	// an unreachable cluster degrades to the Prometheus-only path rather than
	// failing startup.
	cbClient, cbErr := couchbase.New(couchbase.Config{
		Enabled:           cfg.Couchbase.Enabled,
		ConnectionString:  couchbase.BuildConnectionString(cfg.Couchbase.Host),
		Username:          cfg.Couchbase.Username,
		Password:          cfg.Couchbase.Password,
		MetadataBucket:    cfg.Couchbase.MetadataBucket,
		MetricsBucket:     cfg.Couchbase.MetricsBucket,
		MetricsScope:      cfg.Couchbase.MetricsScope,
		MetricsCollection: cfg.Couchbase.MetricsCollection,
	})
	if cbErr != nil {
		logger.Error("Couchbase client init degraded; serving Prometheus path only", "error", cbErr)
	}

	// Per-snapshot router: caches each snapshot's store + time window so
	// routing is a map lookup after the first query.
	metricRouter := router.New(cbClient)

	handler := api.NewHandler(cbClient, promClient, metricRouter)

	mux := http.NewServeMux()
	handler.Register(mux)

	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		logger.Info("Starting HTTP server", "address", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("HTTP server failed", "error", err)
			os.Exit(1)
		}
	}()

	logger.Info("datasource-gateway started")

	// Wait for an interrupt signal to gracefully shut down.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown", "error", err)
		os.Exit(1)
	}

	_ = promClient.Close()
	if err := cbClient.Close(); err != nil {
		logger.Error("Error closing Couchbase client", "error", err)
	}

	logger.Info("Server exited")
}
