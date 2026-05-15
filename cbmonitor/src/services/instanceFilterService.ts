type InstanceFilterChangeListener = (instance: string | null) => void;

/**
 * Singleton holding the current instance (node) filter. When set, panels
 * built via `createMetricPanel` inject an `instance="<value>"` selector into
 * their PromQL so timeseries are scoped to that one node. Null means "all
 * instances" (no filtering). Parallels {@link clusterFilterService}.
 */
class InstanceFilterService {
    private currentInstance: string | null = null;
    private listeners: Set<InstanceFilterChangeListener> = new Set();

    getCurrentInstance(): string | null {
        return this.currentInstance;
    }

    setCurrentInstance(instance: string | null): void {
        if (this.currentInstance !== instance) {
            this.currentInstance = instance;
            this.notifyListeners();
        }
    }

    subscribe(listener: InstanceFilterChangeListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    reset(): void {
        this.setCurrentInstance(null);
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener(this.currentInstance);
        }
    }
}

export const instanceFilterService = new InstanceFilterService();
