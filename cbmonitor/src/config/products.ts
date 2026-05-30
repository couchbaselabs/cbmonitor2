import { SERVICE_CONFIGS } from './services';

/**
 * How a product's tab behaves by default when that product is present in a snapshot.
 * - 'always'       — baseline tab; defaults on whenever the product is present
 *                    (e.g. Couchbase system/kv/cluster_manager, Sync Gateway).
 * - 'whenDetected' — defaults on only when the service appears in the
 *                    snapshot's `services` list; otherwise the tab is still
 *                    available (toggleable in settings) but off.
 */
export type TabVisibility = 'always' | 'whenDetected';

/** One tab a product owns. `serviceKey` references {@link SERVICE_CONFIGS}. */
export interface ProductTab {
    serviceKey: string;
    visibility: TabVisibility;
}

/**
 * A managed product. Interprets the product identifier strings that
 * config-manager stamps onto a snapshot's `metadata.products`: cbmonitor owns
 * which builtin tabs each product surfaces and how they default. `services.ts`
 * stays the catalogue of panel builders; this registry owns ownership + default visibility.
 */
export interface ProductConfig {
    /** Canonical key — matches `metadata.products` entries (e.g. 'couchbase', 'sgw'). */
    key: string;
    /** Display name, used as the group header in the settings menu. */
    title: string;
    /** Alternative identifiers that normalise to `key`. */
    aliases: string[];
    /** Owned tabs, in display order. Tab titles come from `ServiceConfig.title`. */
    tabs: ProductTab[];
}

/**
 * Product registry, in display order. This order — not `metadata.products`
 * order — fixes how products and their tabs are laid out: Couchbase first,
 * then Sync Gateway, then future products as they are registered here.
 */
export const PRODUCT_CONFIGS: ProductConfig[] = [
    {
        key: 'couchbase-server',
        title: 'Couchbase Server',
        aliases: ['couchbase'],
        tabs: [
            { serviceKey: 'system', visibility: 'always' },
            { serviceKey: 'cluster_manager', visibility: 'always' },
            { serviceKey: 'kv', visibility: 'always' },
            { serviceKey: 'index', visibility: 'whenDetected' },
            { serviceKey: 'query', visibility: 'whenDetected' },
            { serviceKey: 'fts', visibility: 'whenDetected' },
            { serviceKey: 'eventing', visibility: 'whenDetected' },
            { serviceKey: 'xdcr', visibility: 'whenDetected' },
            { serviceKey: 'analytics', visibility: 'whenDetected' },
        ],
    },
    {
        key: 'sgw',
        title: 'Sync Gateway',
        aliases: ['sync-gateway', 'syncgateway', 'sgw'],
        tabs: [
            { serviceKey: 'sgw', visibility: 'always' },
        ],
    },
];

/** The product a metadata-less / empty-products snapshot is treated as. */
export const DEFAULT_PRODUCT_KEY = 'couchbase-server';

/**
 * Normalise a product name to its canonical key, resolving aliases and case.
 * Returns the lowercased input unchanged when nothing matches.
 */
export function normaliseProductName(product: string): string {
    const normalised = product.toLowerCase().trim();
    const directMatch = PRODUCT_CONFIGS.find((c) => c.key === normalised);
    if (directMatch) {
        return directMatch.key;
    }
    const aliasMatch = PRODUCT_CONFIGS.find((c) =>
        c.aliases.some((alias) => alias.toLowerCase() === normalised)
    );
    return aliasMatch?.key ?? normalised;
}

/** Look up a product config by canonical key. */
export function getProductConfig(productKey: string): ProductConfig | undefined {
    return PRODUCT_CONFIGS.find((c) => c.key === productKey);
}

/**
 * Resolve the products present in a snapshot to their configs, **in registry
 * order**. An empty product set is treated as Couchbase for the metadata-less fallback.
 * Unknown products are dropped — a snapshot scraping only an unrecognised product owns
 * no builtin tabs and falls through to the Overview.
 */
export function resolveProducts(products?: string[]): ProductConfig[] {
    if (!products || products.length === 0) {
        return [getProductConfig(DEFAULT_PRODUCT_KEY)!];
    }
    const present = new Set(products.map((p) => normaliseProductName(p)));
    return PRODUCT_CONFIGS.filter((c) => present.has(c.key));
}

/** A product tab annotated with the owning product, for grouping/display. */
export interface OwnedTab extends ProductTab {
    productKey: string;
    productTitle: string;
}

/**
 * The ordered set of builtin tabs owned by the products present in a snapshot.
 * Registry product order, then each product's tab order; deduped by
 * `serviceKey` (first owner wins). Single source of tab ownership for both the
 * single-snapshot and comparison views.
 */
export function getOwnedTabs(products?: string[]): OwnedTab[] {
    const seen = new Set<string>();
    const owned: OwnedTab[] = [];
    for (const product of resolveProducts(products)) {
        for (const tab of product.tabs) {
            if (seen.has(tab.serviceKey)) {
                continue;
            }
            // Ignore tabs whose builder isn't registered, so a typo in the
            // product registry can't produce a tab with no scene.
            if (!SERVICE_CONFIGS.some((s) => s.key === tab.serviceKey)) {
                continue;
            }
            seen.add(tab.serviceKey);
            owned.push({ ...tab, productKey: product.key, productTitle: product.title });
        }
    }
    return owned;
}
