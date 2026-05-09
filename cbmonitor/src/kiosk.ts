/**
 * Browser-local "kiosk by default" preference for cbmonitor.
 *
 * Stores a flag in localStorage and, on every Grafana page load, rewrites the
 * URL to include `?kiosk` so Grafana renders without its top/side chrome.
 *
 * This module is wired up via plugin.json's "preload": true so it runs on
 * every page (not just /a/cbmonitor/*).
 */

const STORAGE_KEY = 'cbmonitor.kiosk';
const DEFAULT_ON = true;

export function getKioskPref(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_ON;
    }
    return raw === '1';
  } catch {
    // localStorage may throw in private/incognito modes or with strict cookie
    // policies. Fall back to the default rather than breaking page load.
    return DEFAULT_ON;
  }
}

export function setKioskPref(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    // Non-fatal: preference simply won't persist if storage is unavailable.
  }
}

// Paths where the kiosk redirect must not fire — the user needs full Grafana
// chrome to manage settings, log in, see the preference toggle itself, etc.
const EXEMPT_PREFIXES = [
  '/a/cbmonitor/preferences',
  '/login',
  '/logout',
  '/signup',
  '/invite',
  '/admin',
  '/profile',
  '/org',
  '/plugins',
  '/connections',
  '/datasources',
];

export function applyKioskFromPref(): void {
  if (!getKioskPref()) {
    return;
  }

  const url = new URL(window.location.href);

  // Already in kiosk mode — leave the URL alone (also prevents redirect loops).
  if (url.searchParams.has('kiosk')) {
    return;
  }

  if (EXEMPT_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    return;
  }

  url.searchParams.set('kiosk', '1');
  window.location.replace(url.toString());
}
