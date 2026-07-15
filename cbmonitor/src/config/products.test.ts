import {
    resolveProducts,
    getOwnedTabs,
    normaliseProductName,
    normaliseProductList,
    getProductConfig,
} from './products';

describe('normaliseProductName', () => {
    it('maps aliases and case to the canonical key', () => {
        expect(normaliseProductName('Couchbase')).toBe('couchbase-server');
        expect(normaliseProductName('couchbase-server')).toBe('couchbase-server');
        expect(normaliseProductName('SYNC-GATEWAY')).toBe('sgw');
        expect(normaliseProductName('syncgateway')).toBe('sgw');
    });

    it('returns the lowercased input unchanged when unknown', () => {
        expect(normaliseProductName('Kafka')).toBe('kafka');
    });
});

describe('normaliseProductList', () => {
    it('displays the couchbase alias as couchbase-server', () => {
        expect(normaliseProductList(['couchbase'])).toEqual(['couchbase-server']);
    });

    it('dedupes when both the alias and canonical key are present', () => {
        expect(normaliseProductList(['couchbase', 'couchbase-server'])).toEqual(['couchbase-server']);
    });

    it('leaves unknown products as-is (lowercased)', () => {
        expect(normaliseProductList(['Kafka'])).toEqual(['kafka']);
    });

    it('returns an empty list for undefined/empty input', () => {
        expect(normaliseProductList(undefined)).toEqual([]);
        expect(normaliseProductList([])).toEqual([]);
    });
});

describe('resolveProducts', () => {
    it('treats empty/absent products as Couchbase', () => {
        expect(resolveProducts(undefined).map((p) => p.key)).toEqual(['couchbase-server']);
        expect(resolveProducts([]).map((p) => p.key)).toEqual(['couchbase-server']);
    });

    it('drops unknown products', () => {
        expect(resolveProducts(['kafka']).map((p) => p.key)).toEqual([]);
        expect(resolveProducts(['couchbase', 'kafka']).map((p) => p.key)).toEqual(['couchbase-server']);
    });

    it('returns products in registry order regardless of metadata order', () => {
        expect(resolveProducts(['sgw', 'couchbase']).map((p) => p.key)).toEqual(['couchbase-server', 'sgw']);
        expect(resolveProducts(['couchbase', 'sgw']).map((p) => p.key)).toEqual(['couchbase-server', 'sgw']);
    });

    it('resolves aliases', () => {
        expect(resolveProducts(['sync-gateway']).map((p) => p.key)).toEqual(['sgw']);
    });
});

describe('getOwnedTabs', () => {
    it('returns Couchbase baseline + optional tabs in order', () => {
        const keys = getOwnedTabs(['couchbase']).map((t) => t.serviceKey);
        expect(keys).toEqual([
            'system', 'cluster_manager', 'kv', 'index', 'query', 'fts', 'eventing', 'xdcr', 'analytics',
        ]);
    });

    it('owns only the Sync Gateway tab for an sgw snapshot, with always visibility', () => {
        const tabs = getOwnedTabs(['sgw']);
        expect(tabs.map((t) => t.serviceKey)).toEqual(['sgw']);
        expect(tabs[0].visibility).toBe('always');
        expect(tabs[0].productKey).toBe('sgw');
        expect(tabs[0].productTitle).toBe('Sync Gateway');
    });

    it('unions tabs across products in registry order (couchbase first, then sgw)', () => {
        const keys = getOwnedTabs(['sgw', 'couchbase']).map((t) => t.serviceKey);
        expect(keys[0]).toBe('system');
        expect(keys[keys.length - 1]).toBe('sgw');
    });

    it('returns no owned tabs for an unknown-only product set', () => {
        expect(getOwnedTabs(['kafka'])).toEqual([]);
    });

    it('annotates each tab with its owning product title for grouping', () => {
        const tabs = getOwnedTabs(['couchbase']);
        expect(new Set(tabs.map((t) => t.productTitle))).toEqual(new Set(['Couchbase Server']));
    });
});

describe('getProductConfig', () => {
    it('looks up by canonical key', () => {
        expect(getProductConfig('sgw')?.title).toBe('Sync Gateway');
        expect(getProductConfig('nope')).toBeUndefined();
    });
});
