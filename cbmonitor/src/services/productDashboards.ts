import { getBackendSrv } from '@grafana/runtime';

const PRODUCTS_FOLDER_TITLE = 'products';

export interface ProductDashboard {
    uid: string;
    title: string;
    /** Grafana-supplied URL path (e.g. "/d/<uid>/<slug>"). */
    url: string;
    /** Lowercased first hyphen-separated segment of the dashboard UID. */
    product: string;
}

interface SearchHit {
    uid?: string;
    title?: string;
    url?: string;
    type?: string;
}

interface FolderHit {
    uid?: string;
    title?: string;
}

let folderUidCache: string | null | undefined;
let dashboardCache: Promise<ProductDashboard[]> | null = null;

/**
 * List all user-maintained product dashboards in the Grafana `products/`
 * folder. Resolves to `[]` if the folder is missing or the Grafana API
 * errors — the snapshot view must keep rendering regardless.
 *
 * Results are memoised for the page session; reload to pick up new
 * dashboards added in Grafana.
 */
export function listProductDashboards(): Promise<ProductDashboard[]> {
    if (!dashboardCache) {
        dashboardCache = fetchProductDashboards().catch((err) => {
            console.warn('[cbmonitor] Failed to list product dashboards', err);
            dashboardCache = null;
            return [];
        });
    }
    return dashboardCache;
}

/**
 * Filter discovered dashboards to those whose `product` matches one of the
 * snapshot's products.
 */
export function matchDashboardsForProducts(
    all: ProductDashboard[],
    products: string[] | undefined,
): ProductDashboard[] {
    if (!products || products.length === 0) {
        return [];
    }
    const wanted = new Set(products.map((p) => p.toLowerCase()));
    return all.filter((d) => wanted.has(d.product));
}

async function fetchProductDashboards(): Promise<ProductDashboard[]> {
    const folderUid = await resolveProductsFolderUid();
    if (!folderUid) {
        return [];
    }
    const hits = await getBackendSrv().get<SearchHit[]>('/api/search', {
        type: 'dash-db',
        folderUIDs: folderUid,
    });
    if (!Array.isArray(hits)) {
        return [];
    }
    return hits
        .map(toProductDashboard)
        .filter((d): d is ProductDashboard => d !== null);
}

async function resolveProductsFolderUid(): Promise<string | null> {
    if (folderUidCache !== undefined) {
        return folderUidCache;
    }
    const folders = await getBackendSrv().get<FolderHit[]>('/api/folders');
    if (!Array.isArray(folders)) {
        folderUidCache = null;
        return null;
    }
    const match = folders.find(
        (f) => typeof f.title === 'string' && f.title.toLowerCase() === PRODUCTS_FOLDER_TITLE,
    );
    folderUidCache = match?.uid ?? null;
    return folderUidCache;
}

function toProductDashboard(hit: SearchHit): ProductDashboard | null {
    if (!hit.uid || !hit.title || !hit.url) {
        return null;
    }
    const product = productFromUid(hit.uid);
    if (!product) {
        return null;
    }
    return {
        uid: hit.uid,
        title: hit.title,
        url: hit.url,
        product,
    };
}

function productFromUid(uid: string): string | null {
    const segment = uid.split('-', 1)[0]?.trim().toLowerCase();
    return segment || null;
}
