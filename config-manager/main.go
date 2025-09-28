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

	"github.com/couchbase/config-manager/internal/api"
	"github.com/couchbase/config-manager/internal/config"
	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/manager"
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

	interval := cfg.Manager.Interval
	mininterval := cfg.Manager.MinInterval

	// Validate manager interval
	if interval > 30*time.Minute || interval < mininterval{
		logger.Warn("Manager interval should be between 5 and 30 minutes", "interval", interval, "default", 5*time.Minute)
		interval = mininterval // Default to 5 minutes if invalid
	}

	staleThreshold := cfg.Manager.StaleThreshold
	// Validate manager stale threshold
	if staleThreshold > 30*time.Minute || staleThreshold < 5*time.Minute {
		logger.Warn("Manager stale threshold should be between 5 and 30 minutes", "stale_threshold", staleThreshold, "default", 5*time.Minute)
		staleThreshold = 5 * time.Minute // Default to 5 minutes if invalid
	}

	// Initialize metadata storage
	metadataStorage, err := storage.NewMetadataStorage(cfg)
	if err != nil {
		logger.Error("Failed to initialize metadata storage. Metadata will not be collected.", "error", err)
	}else{
		logger.Info("Metadata storage initialized", "type", metadataStorage.Type())
	}

	// Initialize API handler
	handler := api.NewHandler(fileStorage, metadataStorage, cfg.Agent.Type)

	// Setup HTTP server
	mux := http.NewServeMux()

	// Register routes
	mux.HandleFunc("/api/v1/snapshot", handler.CreateSnapshot)
	mux.HandleFunc("/api/v1/snapshot/", handler.Manager)

	// Create server
	server := &http.Server{
		Addr:    fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port),
		Handler: mux,
	}

	// Start server
	go func() {
		logger.Info("Starting server", "address", fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("Failed to start server", "error", err)
			os.Exit(1)
		}
	}()
	logger.Debug(
    "interval, mininterval and stale threshold",
    "interval", interval.String(),
    "mininterval", mininterval.String(),
    "stale_threshold", staleThreshold.String(),
)

	logger.Info("Config Manager REST Service Started")

	go func() {
		
		manager.StartManagerWithInterval(manager.Information{
			Interval:     interval,
			MinInterval:  mininterval,
			StaleThreshold: staleThreshold,
		}, cfg.Agent.Directory)
	}()
	logger.Info("Manager Service Started")

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Graceful shutdown
	if err := server.Shutdown(context.Background()); err != nil {
		logger.Error("Server forced to shutdown", "error", err)
		os.Exit(1)
	}

	logger.Info("Server exited")
}
