import { getBackendSrv } from '@grafana/runtime';
import { API_BASE_URL } from '../constants';

/**
 * The plugin backend creates and repoints its Prometheus datasource on the
 * first call it receives after Grafana starts or its settings change; Grafana
 * gives a plugin its settings only with a request, so it cannot do this at
 * startup on its own. The app root therefore calls the backend on every load.
 */

/** Reconciliation state as reported by `/config/datasources`. */
export interface ReconcileState {
  status: string; // "pending" | "ok" | "skipped" | "error" | "disabled"
  lastError?: string;
}

export const POLL_INTERVAL_MS = 500;
export const POLL_TIMEOUT_MS = 30_000;

// Grafana sends the datasource list to the browser once, at page load, so a
// datasource created after that only appears after a reload. The marker stops
// a page that still has no datasource after reloading from reloading again.
const RELOAD_MARKER = 'cbmonitor:datasource-reload';
const RELOAD_MARKER_TTL_MS = 60_000;

async function fetchReconcileState(): Promise<ReconcileState> {
  const response: any = await getBackendSrv().get(`${API_BASE_URL}/config/datasources`, undefined, undefined, {
    showErrorAlert: false,
  });
  const state = response?.reconciliation ?? {};
  return { status: String(state.status ?? 'unknown'), lastError: state.lastError || undefined };
}

/** Calls the backend so this Grafana start's reconciliation runs, without waiting on it. */
export function triggerReconcile(): void {
  fetchReconcileState().catch(() => {
    // Nothing to recover here: the datasource already exists.
  });
}

/**
 * Calls the backend and waits for reconciliation to finish. Resolves with the
 * final state, or the last one seen when the wait times out or the backend
 * cannot be reached.
 */
export async function awaitReconcile(
  intervalMs = POLL_INTERVAL_MS,
  timeoutMs = POLL_TIMEOUT_MS
): Promise<ReconcileState> {
  const deadline = Date.now() + timeoutMs;
  let last: ReconcileState = { status: 'unknown' };
  while (true) {
    try {
      last = await fetchReconcileState();
      if (last.status !== 'pending') {
        return last;
      }
    } catch (err: any) {
      last = { status: 'unreachable', lastError: err?.message ?? String(err) };
    }
    if (Date.now() + intervalMs > deadline) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Whether this tab already reloaded to pick up a new datasource moments ago. */
export function recentlyReloaded(now = Date.now()): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_MARKER));
    return Number.isFinite(at) && at > 0 && now - at < RELOAD_MARKER_TTL_MS;
  } catch {
    return false;
  }
}

export function clearReloadMarker(): void {
  try {
    sessionStorage.removeItem(RELOAD_MARKER);
  } catch {
    // Storage unavailable: the marker was never written either.
  }
}

/**
 * Reloads the page to fetch the new datasource list, marking the attempt first.
 * Returns false, without reloading, when the marker cannot be stored.
 */
export function reloadForDatasource(): boolean {
  try {
    sessionStorage.setItem(RELOAD_MARKER, String(Date.now()));
  } catch {
    // Without storage there is no loop guard, so do not reload blindly.
    return false;
  }
  window.location.reload();
  return true;
}
