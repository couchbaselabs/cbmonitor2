package manager

import (
	"log"
	"os"
	"path/filepath"
	"time"
)


func StartManagerWithInterval(interval int, directory string) {
	for {
		// Manager logic goes here
		log.Printf("Manager is running with interval: %d minutes", interval)
		files, err := os.ReadDir(directory)
		if err != nil {
			log.Printf("Failed to read directory: %v", err)
		}else {
			for _, file := range files {
				if filepath.Ext(file.Name()) == ".yml" {
					filepath := filepath.Join(directory, file.Name())
					info, err := os.Stat(filepath)
					if err != nil {
						log.Printf("Failed to stat file: %s, error: %v", filepath, err)
						continue
					}
					// Process the file
					log.Printf("Processing file: %s", filepath)

					if time.Since(info.ModTime()) > time.Duration(interval)*time.Minute {
						if err := os.Remove(filepath); err != nil {
							log.Printf("failed to delete stale file: %v", err)
						}
					}
				}
			}
		}
		time.Sleep(time.Duration(interval) * time.Minute)
	}
}
