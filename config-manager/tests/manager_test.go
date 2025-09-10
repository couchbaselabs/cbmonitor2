package tests

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/couchbase/config-manager/internal/manager"
)

func TestStaleConfigRemoval(t *testing.T) {
	tempDir := t.TempDir()

	// create a mock yml file that will be fresh 
	fresh := filepath.Join(tempDir, "fresh.yml")
	if err := os.WriteFile(fresh, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create fresh file: %v", err)
	}

	// create a mock yml file that will be stale
	stale := filepath.Join(tempDir, "stale.yml")
	if err := os.WriteFile(stale, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create stale file: %v", err)
	}	

	// set the modified time of the stale file in the past
	oldTime := time.Now().Add(-5 * time.Minute)
	if err := os.Chtimes(stale, oldTime, oldTime); err != nil {
		t.Fatalf("Failed to set modified time for stale file: %v", err)
	}

	go manager.StartManagerWithInterval(manager.Information{
		Interval:     1 * time.Minute,
		MinInterval:  5 * time.Minute,
		StaleThreshold: 5 * time.Minute,
	}, tempDir)

	time.Sleep(5 * time.Second)

	// check that stale file is gone and then check that fresh file still exists
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Errorf("Expected stale file to be deleted, but it still exists")
	}
	if _, err := os.Stat(fresh); os.IsNotExist(err) {
		t.Errorf("Expected fresh file to still exist, but it was deleted")
	}
}
