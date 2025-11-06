// Service to manage dashboard layout state (grid vs rows)
// This is persisted in the browser's localStorage

export type LayoutMode = 'grid' | 'rows';

class LayoutService {
    private layout: LayoutMode = 'grid';
    private listeners: Set<(layout: LayoutMode) => void> = new Set();

    constructor() {
        // Load from localStorage if available
        const stored = localStorage.getItem('cbmonitor-layout');
        if (stored === 'grid' || stored === 'rows') {
            this.layout = stored;
        }
    }

    getLayout(): LayoutMode {
        return this.layout;
    }

    setLayout(layout: LayoutMode) {
        this.layout = layout;
        // Persist to localStorage
        localStorage.setItem('cbmonitor-layout', layout);
        // Notify all listeners
        this.listeners.forEach(listener => listener(layout));
    }

    subscribe(listener: (layout: LayoutMode) => void): () => void {
        this.listeners.add(listener);
        // Return unsubscribe function
        return () => {
            this.listeners.delete(listener);
        };
    }

    getPanelWidth(): string {
        return this.layout === 'grid' ? '49%' : '100%';
    }
}

// Export singleton instance
export const layoutService = new LayoutService();
