import { getAvailableTabs, getTabsToRender, OVERVIEW_TAB_KEY } from './tabVisibility';

/** Convenience: keys of tabs that default to visible. */
function defaultVisibleKeys(tabs: ReturnType<typeof getAvailableTabs>): string[] {
    return tabs.filter((t) => t.defaultVisible).map((t) => t.key);
}

describe('getAvailableTabs — product ownership', () => {
    it('Couchbase snapshot: baseline tabs default on, detected optionals on, undetected available-but-off', () => {
        const tabs = getAvailableTabs(['index'], undefined, ['couchbase']);
        const keys = tabs.map((t) => t.key);
        // Only Couchbase-server-owned tabs are listed (no sgw).
        expect(keys).toContain('kv');
        expect(keys).not.toContain('sgw');
        // Baseline always-on + detected 'index' on.
        expect(defaultVisibleKeys(tabs)).toEqual(
            expect.arrayContaining(['system', 'kv', 'cluster_manager', 'index'])
        );
        // Undetected optional is available but off by default.
        const query = tabs.find((t) => t.key === 'query');
        expect(query).toBeDefined();
        expect(query!.defaultVisible).toBe(false);
        // Tabs carry their owning product for grouping.
        expect(tabs.find((t) => t.key === 'kv')!.productTitle).toBe('Couchbase Server');
    });

    it('Sync Gateway snapshot with empty services: SGW tab is owned and defaults visible', () => {
        const tabs = getAvailableTabs([], undefined, ['sgw']);
        expect(tabs.map((t) => t.key)).toEqual(['sgw']);
        expect(tabs[0].defaultVisible).toBe(true);
        expect(tabs[0].productTitle).toBe('Sync Gateway');
    });

    it('legacy snapshot (no products) behaves as Couchbase', () => {
        const tabs = getAvailableTabs([], undefined, undefined);
        expect(defaultVisibleKeys(tabs)).toEqual(
            expect.arrayContaining(['system', 'kv', 'cluster_manager'])
        );
    });

    it('mixed products: Couchbase tabs first, then SGW, regardless of metadata order', () => {
        const tabs = getAvailableTabs([], undefined, ['sgw', 'couchbase']);
        const builtins = tabs.map((t) => t.key);
        expect(builtins[0]).toBe('system');
        expect(builtins[builtins.length - 1]).toBe('sgw');
    });

    it('unknown-only product set owns no builtin tabs', () => {
        const tabs = getAvailableTabs([], undefined, ['kafka']);
        expect(tabs.filter((t) => t.kind === 'builtin')).toEqual([]);
    });

    it('appends custom panels as visible tabs regardless of product', () => {
        const tabs = getAvailableTabs([], [{ title: 'My Panel', metrics: [] } as any], ['kafka']);
        const custom = tabs.find((t) => t.kind === 'custom');
        expect(custom).toBeDefined();
        expect(custom!.defaultVisible).toBe(true);
        expect(custom!.productTitle).toBeUndefined();
    });
});

describe('getTabsToRender — Overview fallback', () => {
    it('falls back to Overview when no product owns a builtin tab and there are no customs', () => {
        const tabs = getAvailableTabs([], undefined, ['kafka']);
        const rendered = getTabsToRender(tabs);
        expect(rendered).toHaveLength(1);
        expect(rendered[0].key).toBe(OVERVIEW_TAB_KEY);
    });

    it('does not fall back when Couchbase baseline tabs are visible', () => {
        const tabs = getAvailableTabs([], undefined, ['couchbase']);
        const rendered = getTabsToRender(tabs);
        expect(rendered.some((t) => t.key === OVERVIEW_TAB_KEY)).toBe(false);
        expect(rendered.map((t) => t.key)).toEqual(
            expect.arrayContaining(['system', 'kv', 'cluster_manager'])
        );
    });
});
