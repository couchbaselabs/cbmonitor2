package plugin

import (
	"context"
	"errors"
	"testing"
	"time"
)

// TestDispose_CancelsReconcileContext verifies Dispose() cancels the
// per-App reconcileCtx so the background reconcile goroutine observes
// shutdown. Service closing itself needs a real gocb cluster to exercise
// and is covered by integration testing, not by this unit test.
func TestDispose_CancelsReconcileContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	app := &App{
		settings:        defaultSettings(),
		reconcileCtx:    ctx,
		reconcileCancel: cancel,
	}

	// Sanity: not cancelled yet.
	select {
	case <-app.reconcileCtx.Done():
		t.Fatal("reconcileCtx already cancelled before Dispose")
	default:
	}

	app.Dispose()

	// Dispose should have fired reconcileCancel, making Done() return.
	select {
	case <-app.reconcileCtx.Done():
		if !errors.Is(app.reconcileCtx.Err(), context.Canceled) {
			t.Errorf("reconcileCtx.Err = %v, want context.Canceled", app.reconcileCtx.Err())
		}
	case <-time.After(time.Second):
		t.Fatal("reconcileCtx not cancelled within 1s of Dispose")
	}
}

// TestDispose_NilServicesAreSafe verifies Dispose() does not panic when
// the App was constructed against settings where neither feature was
// enabled (so both service fields are nil).
func TestDispose_NilServicesAreSafe(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	app := &App{
		settings:         defaultSettings(),
		reconcileCtx:     ctx,
		reconcileCancel:  cancel,
		snapshotService:  nil,
		couchbaseService: nil,
	}
	app.Dispose() // must not panic
}
