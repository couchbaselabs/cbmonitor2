package manager

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/couchbase/config-manager/internal/config"
	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/storage"
)

type Information struct {
	Interval       time.Duration
	MinInterval    time.Duration
	StaleThreshold time.Duration
}

func StartManagerWithInterval(information Information, directory string, cfg *config.Config) {
	// Initialize metadata storage
	metadataStorage, err := storage.NewMetadataStorage(cfg)
	if err != nil {
		logger.Error("Failed to initialize metadata storage", "error", err)
		return
	}
	defer metadataStorage.Close()

	for {
		// Manager logic goes here
		logger.Debug("Manager is checking the directory", "directory", directory)
		files, err := os.ReadDir(directory)
		if err != nil {
			logger.Error("Failed to read directory", "directory", directory, "error", err)
			return
		}
		logger.Info("Scrape files found", "count", len(files))
		for _, file := range files {
			if filepath.Ext(file.Name()) == ".yml" {
				filepath := filepath.Join(directory, file.Name())
				info, err := os.Stat(filepath)
				if err != nil {
					logger.Error("Failed to stat file", "filepath", filepath, "error", err)
					continue
				}
				// Process the file
				logger.Debug("Processing file", "filepath", filepath)

				if time.Since(info.ModTime()) > information.StaleThreshold {
					// Extract snapshot ID from filename (remove .yml extension)
						snapshotID := strings.TrimSuffix(file.Name(), ".yml")
					// Update metadata to mark snapshot as ended
					if err := metadataStorage.EoLSnapshot(snapshotID); err != nil {
						logger.Error("Failed to update snapshot end time in metadata", "snapshotID", snapshotID, "error", err)
					} else {
						logger.Info("Successfully updated snapshot end time in metadata", "snapshotID", snapshotID)
					}

					// Delete the stale file
					if err := os.Remove(filepath); err != nil {
						logger.Error("Failed to delete stale file", "filepath", filepath, "error", err)
					} else {
						logger.Info("Deleted stale file", "filepath", filepath, "age_minutes", int(time.Since(info.ModTime()).Minutes()))
					}
				}
			}
		}
		time.Sleep(information.Interval)
	}
}
