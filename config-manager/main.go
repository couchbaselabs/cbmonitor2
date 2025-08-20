package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/couchbase/config-manager/internal/api"
	"github.com/couchbase/config-manager/internal/config"
	"github.com/couchbase/config-manager/internal/storage"
)

func main() {
	var configPath string
	// If config is not provided, assume we are running in a dev mode and use the default config
	flag.StringVar(&configPath, "config", "configs/config-manager/config.yaml", "Path to the configuration file")
	flag.Parse()

	log.Println("Config Manager Service Starting...")

	// Load configuration
	log.Printf("Loading configurations from %s", configPath)
	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		log.Fatalf("Failed to load configurations: %v", err)
	}

	// Validate agent type is vmagent
	if strings.ToLower(cfg.Agent.Type) != "vmagent" {
		log.Fatalf("Unsupported agent type: %s. Only vmagent is supported", cfg.Agent.Type)
	}

	// Validate if the base directory exists before initializing storage
	if _, err := os.Stat(cfg.Agent.Directory); os.IsNotExist(err) {
		if err := os.MkdirAll(cfg.Agent.Directory, 0755); err != nil {
			log.Fatalf("Failed to create directory: %s, error: %v", cfg.Agent.Directory, err)
		}
	}

	fileStorage := storage.NewFileStorage(cfg.Agent.Directory)

	// Initialize API handler
	handler := api.NewHandler(fileStorage, cfg.Agent.Type)

	// Setup HTTP server
	mux := http.NewServeMux()

	// Register routes
	mux.HandleFunc("/api/v1/snapshot", handler.CreateSnapshot)

	// Create server
	server := &http.Server{
		Addr:    fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port),
		Handler: mux,
	}

	// Start server
	go func() {
		log.Printf("Starting server on %s:%d", cfg.Server.Host, cfg.Server.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	log.Println("Config Manager Service Started")

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Graceful shutdown
	if err := server.Shutdown(context.Background()); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
