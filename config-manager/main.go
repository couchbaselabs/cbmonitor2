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

	"github.com/couchbase/config-manager/internal/api"
	"github.com/couchbase/config-manager/internal/config"
	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/manager"
	"github.com/couchbase/config-manager/internal/metrics"
	"github.com/couchbase/config-manager/internal/storage"
)

func main() {
	var configPath string
	// If config is not provided, use the defaults with any of the flag overrides
	flag.StringVar(&configPath, "config", "", "Path to the configuration file")

	// Parse all flags first to get any dot-notation overrides
	flag.Parse()

	// Collect any remaining arguments that might be dot-notation overrides
	flagOverrides := make(map[string]string)
	for _, arg := range flag.Args() {
		if strings.Contains(arg, "=") {
			parts := strings.SplitN(arg, "=", 2)
			if len(parts) == 2 {
				// Remove leading dashes if present
				flagName := strings.TrimLeft(parts[0], "-")
				flagOverrides[flagName] = parts[1]
			}
		}
	}

	// Load configuration with potential overrides first
	if len(configPath) > 0 {
		logger.GetLogger().Info("Loading configurations from file", "path", configPath)
	}

	cfg, err := config.LoadConfig(configPath, flagOverrides)
	if err != nil {
		logger.GetLogger().Error("Failed to load configurations", "error", err)
		os.Exit(1)
	}

	// Initialize logger with the configured log level
	logger.InitLogger(cfg.Logging.Level)

	logger.Info("Config Manager Service Starting...")
	logger.Info("Configuration loaded",
		"server_port", cfg.Server.Port,
		"server_host", cfg.Server.Host,
		"agent_type", cfg.Agent.Type,
		"agent_directory", cfg.Agent.Directory,
		"logging_level", cfg.Logging.Level,
		"manager_interval", cfg.Manager.Interval,
		"manager_min_interval", cfg.Manager.MinInterval,
		"manager_stale_threshold", cfg.Manager.StaleThreshold,
		"metadata_enabled", cfg.Metadata.Enabled,
		"metadata_host", cfg.Metadata.Host,
		"metadata_bucket", cfg.Metadata.Bucket,
	)

	// Validate agent type is vmagent
	if strings.ToLower(cfg.Agent.Type) != "vmagent" {
		logger.Error("Unsupported agent type", "type", cfg.Agent.Type, "supported", "vmagent")
		os.Exit(1)
	}

	// Validate if the base directory exists before initializing storage
	if _, err := os.Stat(cfg.Agent.Directory); os.IsNotExist(err) {
		if err := os.MkdirAll(cfg.Agent.Directory, 0755); err != nil {
			logger.Error("Failed to create directory", "directory", cfg.Agent.Directory, "error", err)
			os.Exit(1)
		}
	}

	fileStorage := storage.NewFileStorage(cfg.Agent.Directory)

	if err := manager.ValidateTimings(cfg.Manager.Interval, cfg.Manager.MinInterval, cfg.Manager.StaleThreshold); err != nil {
		logger.Error("Invalid manager configuration", "error", err)
		os.Exit(1)
	}

	// Initialize metadata storage
	metadataStorage, err := storage.NewMetadataStorage(cfg)
	if err != nil {
		logger.Error("Failed to initialize metadata storage. Metadata will not be collected.", "error", err)
		metadataStorage = storage.NewFileMetadataStorage(cfg.Agent.Directory)
		logger.Info("Falling back to file metadata storage", "directory", cfg.Agent.Directory)
	} else {
		logger.Info("Metadata storage initialized", "type", metadataStorage.Type())
	}

	// Metadata writes that fail are queued on disk and retried in the background.
	pending, err := storage.NewPendingQueue(cfg.Agent.Directory)
	if err != nil {
		logger.Error("Failed to open the pending metadata-write queue", "error", err)
		os.Exit(1)
	}

	// Initialize API handler
	handler := api.NewHandler(fileStorage, metadataStorage, cfg.Agent.Type, pending)

	// Setup HTTP server
	mux := http.NewServeMux()

	// Register routes
	mux.HandleFunc("/api/v1/snapshot", handler.CreateSnapshot)
	mux.HandleFunc("/api/v1/snapshot/", handler.Manager)
	mux.Handle("/metrics", metrics.Handler())

	// Create server
	server := newHTTPServer(fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port), mux)

	metrics.MarkUp()

	// Start server
	go func() {
		logger.Info("Starting server", "address", fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("Failed to start server", "error", err)
			os.Exit(1)
		}
	}()
	logger.Info("Config Manager REST Service Started")

	// The sweep shares the API's metadata storage and write queue, so an end
	// of life it cannot record now is retried like any other.
	sweeper := &manager.Sweeper{
		Files:          fileStorage,
		End:            handler.EndSnapshot,
		Interval:       cfg.Manager.Interval,
		StaleThreshold: cfg.Manager.StaleThreshold,
		HoldPeriod:     manager.DefaultHoldPeriod,
	}
	sweepCtx, stopSweep := context.WithCancel(context.Background())
	sweepDone := make(chan struct{})
	go func() {
		defer close(sweepDone)
		sweeper.Run(sweepCtx)
	}()
	logger.Info("Manager Service Started", "interval", cfg.Manager.Interval.String(),
		"stale_threshold", cfg.Manager.StaleThreshold.String(), "hold_period", manager.DefaultHoldPeriod.String())

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Graceful shutdown
	stopSweep()
	<-sweepDone
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown", "error", err)
		os.Exit(1)
	}
	handler.Shutdown(ctx)

	logger.Info("Server exited")
}
