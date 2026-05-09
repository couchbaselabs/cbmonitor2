/**
 * Browser-local user preferences for cbmonitor.
 *
 * These preferences live in localStorage so they work for anonymous users
 * (where Grafana has no per-user preferences API to fall back on). On every
 * Grafana page load we translate the stored prefs into URL query parameters
 * that Grafana itself honors:
 *
 *   - kiosk → `?kiosk=1`         (hides Grafana chrome)
 *   - theme → `?theme=light|dark` (overrides bootData.user.theme)
 *
 * Wired up via plugin.json's `"preload": true` so the rewrite happens on every
 * page (home, dashboards, plugin pages), not only inside /a/cbmonitor/*.
 */

const KIOSK_KEY = 'cbmonitor.kiosk';
const THEME_KEY = 'cbmonitor.theme';

const KIOSK_DEFAULT_ON = true;

export type ThemePref = 'system' | 'light' | 'dark';
const THEME_DEFAULT: ThemePref = 'system';
const THEME_VALUES: readonly ThemePref[] = ['system', 'light', 'dark'];

// localStorage may throw in private/incognito modes or with strict cookie
// policies. Wrap reads/writes so a storage failure never breaks page load.
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Non-fatal: preference simply won't persist if storage is unavailable.
  }
}

// ---------------------------------------------------------------------------
// Kiosk
// ---------------------------------------------------------------------------

export function getKioskPref(): boolean {
  const raw = safeGet(KIOSK_KEY);
  if (raw === null) {
    return KIOSK_DEFAULT_ON;
  }
  return raw === '1';
}

export function setKioskPref(on: boolean): void {
  safeSet(KIOSK_KEY, on ? '1' : '0');
}

// Paths where the kiosk redirect must not fire — the user needs full Grafana
// chrome here (login flows, admin, the preferences page itself).
const KIOSK_EXEMPT_PREFIXES = [
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

function isKioskExempt(pathname: string): boolean {
  return KIOSK_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export function getThemePref(): ThemePref {
  const raw = safeGet(THEME_KEY);
  if (raw && (THEME_VALUES as readonly string[]).includes(raw)) {
    return raw as ThemePref;
  }
  return THEME_DEFAULT;
}

export function setThemePref(theme: ThemePref): void {
  safeSet(THEME_KEY, theme);
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Apply stored preferences by rewriting the current URL. Performs a single
 * `location.replace()` if any param needs to be added, so the user sees at
 * most one early redirect per page load.
 *
 * URL params already present on the page are left untouched — that lets users
 * (and Grafana's own controls, e.g. the `d k` shortcut) override the
 * preference for a single page without us fighting them.
 */
export function applyPreferencesToUrl(): void {
  const url = new URL(window.location.href);
  let changed = false;

  if (
    getKioskPref() &&
    !url.searchParams.has('kiosk') &&
    !isKioskExempt(url.pathname)
  ) {
    url.searchParams.set('kiosk', '1');
    changed = true;
  }

  const theme = getThemePref();
  if (theme !== 'system' && !url.searchParams.has('theme')) {
    url.searchParams.set('theme', theme);
    changed = true;
  }

  if (changed) {
    window.location.replace(url.toString());
  }
}
