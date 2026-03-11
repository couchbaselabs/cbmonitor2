type ClusterFilterChangeListener = (clusterId: string | null) => void;

/**
 * Singleton service for managing cluster filter state.
 * When a cluster is selected, panels will filter data to show only nodes from that cluster.
 * When null, all clusters are shown.
 */
class ClusterFilterService {
    private currentCluster: string | null = null;
    private listeners: Set<ClusterFilterChangeListener> = new Set();

    /**
     * Get the current cluster filter.
     * @returns The cluster ID to filter by, or null for all clusters.
     */
    getCurrentCluster(): string | null {
        return this.currentCluster;
    }

    /**
     * Set the current cluster filter.
     * @param clusterId - The cluster ID to filter by, or null for all clusters.
     */
    setCurrentCluster(clusterId: string | null): void {
        if (this.currentCluster !== clusterId) {
            this.currentCluster = clusterId;
            this.notifyListeners();
        }
    }

    /**
     * Subscribe to cluster filter changes.
     * @param listener - Callback to invoke when cluster filter changes.
     * @returns Unsubscribe function.
     */
    subscribe(listener: ClusterFilterChangeListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Reset the cluster filter to show all clusters.
     */
    reset(): void {
        this.setCurrentCluster(null);
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener(this.currentCluster);
        }
    }
}

export const clusterFilterService = new ClusterFilterService();
