import { getServiceConfig, normaliseServiceName } from '../config/services';
import { getOwnedTabs } from '../config/products';
import type { CustomPanelsConfig } from '../types/snapshot';

/**
 * Pure tab-availability/visibility layer for the snapshot view. Kept free of
 * `@grafana/scenes` so it can be reasoned about and unit-tested without the
 * scene runtime; `pageBuilder.ts` consumes and re-exports these.
 *
 * A single tab that the snapshot view *could* show. Drives both the
 * SettingsDropdown checkbox list and `buildServiceTabs`'s filter. Each tab
 * has a `defaultVisible` flag computed from snapshot metadata at view time;
 * the user can override it via `tabOverrides`.
 */
export interface AvailableTab {
    key: string;
    title: string;
    defaultVisible: boolean;
    kind: 'builtin' | 'custom' | 'overview';
    /** Present for builtin tabs only. */
    serviceKey?: string;
    /** Present for custom tabs only. */
    customConfig?: CustomPanelsConfig;
    /** URL segment. For builtins, the ServiceConfig.segment (may be ''). For custom tabs, the slugged 'custom-…'. */
    segment: string;
    /** Owning product key for builtin tabs (e.g. 'couchbase-server', 'sgw'); undefined for custom tabs. */
    product?: string;
    /** Owning product display title — the settings-menu group header. Undefined for custom tabs. */
    productTitle?: string;
}

export const OVERVIEW_TAB_KEY = 'overview';
export const OVERVIEW_TAB_SEGMENT = 'overview';

const OVERVIEW_TAB: AvailableTab = {
    key: OVERVIEW_TAB_KEY,
    title: 'Overview',
    defaultVisible: true,
    kind: 'overview',
    segment: OVERVIEW_TAB_SEGMENT,
};

/**
 * Resolve the tabs that should actually render given the available tabs
 * and current user overrides. When no builtin / custom tab would be
 * visible, fall back to a single synthesised Overview tab so the view
 * always has something to route to.
 *
 * The Overview tab is intentionally absent from `getAvailableTabs` so it
 * doesn't show up as a toggle row in the SettingsDropdown; it appears
 * and disappears automatically based on what else is visible.
 */
export function getTabsToRender(
    available: AvailableTab[],
    overrides?: Record<string, boolean>,
): AvailableTab[] {
    const visible = available.filter((t) => isTabVisible(t, overrides));
    if (visible.length > 0) {
        return visible;
    }
    return [OVERVIEW_TAB];
}

/**
 * Compute the full set of available tabs for a snapshot.
 *
 * Tabs are owned by the products present (see products.ts): only services
 * owned by a present product are listed (and thus toggleable). An owned tab
 * defaults on when its visibility is 'always', or when it's 'whenDetected'
 * and the service appears in `services`. Each `customPanels` entry is
 * appended, defaultVisible=true.
 */
export function getAvailableTabs(
    services: string[] | undefined,
    customPanels?: CustomPanelsConfig[],
    products?: string[],
): AvailableTab[] {
    // Canonicalise the metadata's services through `normaliseServiceName`
    // so aliases (e.g. "n1ql" → "query", "sync-gateway" → "sgw") and case
    // variants are treated as the canonical key.
    const detected = new Set((services ?? []).map((s) => normaliseServiceName(s)));
    const tabs: AvailableTab[] = getOwnedTabs(products).map((owned) => {
        const cfg = getServiceConfig(owned.serviceKey)!;
        return {
            key: cfg.key,
            title: cfg.title,
            defaultVisible: owned.visibility === 'always' || detected.has(cfg.key),
            kind: 'builtin',
            serviceKey: cfg.key,
            segment: cfg.segment,
            product: owned.productKey,
            productTitle: owned.productTitle,
        };
    });

    if (customPanels && customPanels.length > 0) {
        const usedSegments = new Set<string>();
        customPanels.forEach((cp, idx) => {
            const segment = uniqueCustomSegment(cp, idx, usedSegments);
            tabs.push({
                key: segment,
                title: cp.title?.trim() || 'Custom',
                defaultVisible: true,
                kind: 'custom',
                customConfig: cp,
                segment,
            });
        });
    }

    return tabs;
}

/**
 * Resolve a tab's effective visibility: explicit user override wins, else the default computed at view time.
 */
export function isTabVisible(tab: AvailableTab, overrides?: Record<string, boolean>): boolean {
    const override = overrides?.[tab.key];
    return typeof override === 'boolean' ? override : tab.defaultVisible;
}

/**
 * Slugify a custom-panels title into a URL-safe segment, deduping
 * collisions by appending a numeric suffix. Falls back to
 * `custom-<idx>` when the title is empty / non-alphanumeric.
 */
export function uniqueCustomSegment(cp: CustomPanelsConfig, idx: number, used: Set<string>): string {
    const base = (cp.title ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    let candidate = base ? `custom-${base}` : `custom-${idx}`;
    let n = 2;
    while (used.has(candidate)) {
        candidate = (base ? `custom-${base}` : `custom-${idx}`) + `-${n++}`;
    }
    used.add(candidate);
    return candidate;
}
