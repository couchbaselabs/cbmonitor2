package manager

import (
	"os"
	"path/filepath"
	"time"

	"github.com/couchbase/config-manager/internal/logger"
)

type Information struct {
		Interval     time.Duration  
		MinInterval  time.Duration  
		StaleThreshold time.Duration  
	}

func StartManagerWithInterval(information Information, directory string) {
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
