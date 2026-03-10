// Service to manage dashboard layout state (grid vs rows)
// This is persisted in the browser's localStorage

export type LayoutMode = 'grid' | 'rows';

type LayoutChangeListener = (layout: LayoutMode) => void;
type HideEmptyChangeListener = (hideEmpty: boolean) => void;

class LayoutService {
    private layout: LayoutMode = 'grid';
    private hideEmptyPanels: boolean = false;
    private layoutListeners: Set<LayoutChangeListener> = new Set();
    private hideEmptyListeners: Set<HideEmptyChangeListener> = new Set();

    constructor() {
        // Load from localStorage if available
        const stored = localStorage.getItem('cbmonitor-layout');
        if (stored === 'grid' || stored === 'rows') {
            this.layout = stored;
        }
        const storedHideEmpty = localStorage.getItem('cbmonitor-hide-empty');
        this.hideEmptyPanels = storedHideEmpty === 'true';
    }

    getLayout(): LayoutMode {
        return this.layout;
    }

    setLayout(layout: LayoutMode) {
        this.layout = layout;
        // Persist to localStorage
        localStorage.setItem('cbmonitor-layout', layout);
        // Notify all listeners
        this.layoutListeners.forEach(listener => listener(layout));
    }

    subscribe(listener: LayoutChangeListener): () => void {
        this.layoutListeners.add(listener);
        // Return unsubscribe function
        return () => {
            this.layoutListeners.delete(listener);
        };
    }

    getHideEmptyPanels(): boolean {
        return this.hideEmptyPanels;
    }

    setHideEmptyPanels(hide: boolean) {
        this.hideEmptyPanels = hide;
        localStorage.setItem('cbmonitor-hide-empty', String(hide));
        this.hideEmptyListeners.forEach(listener => listener(hide));
    }

    subscribeHideEmpty(listener: HideEmptyChangeListener): () => void {
        this.hideEmptyListeners.add(listener);
        return () => {
            this.hideEmptyListeners.delete(listener);
        };
    }

    getPanelWidth(): string {
        return this.layout === 'grid' ? '49%' : '100%';
    }
}

// Export singleton instance
export const layoutService = new LayoutService();
