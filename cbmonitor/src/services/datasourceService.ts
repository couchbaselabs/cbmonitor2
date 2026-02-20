import { DataSourceType, DataSourceConfig, DataSourceAvailability } from '../types/datasource';
import { getBackendSrv } from '@grafana/runtime';
import { PROM_DATASOURCE_REF, CB_DATASOURCE_REF } from '../constants';

type DataSourceChangeListener = (dataSource: DataSourceType) => void;

/**
 * Singleton service for managing which datasource (Couchbase SQL++ vs PromQL) is active.
 */
class DataSourceService {
    private currentDataSource: DataSourceType = DataSourceType.Couchbase;
    private config: DataSourceConfig = {
        defaultDataSource: DataSourceType.Couchbase,
        promqlEnabled: true,
    };
    private listeners: Set<DataSourceChangeListener> = new Set();
    private configLoaded = false;

    /**
     * Load (or return cached) datasource configuration.
     * Currently returns a hardcoded config; can be extended to fetch from backend.
     */
    async loadConfig(): Promise<DataSourceConfig> {
        if (!this.configLoaded) {
            // Default config — extend here if config comes from the backend in the future
            this.configLoaded = true;
        }
        return this.config;
    }

    /** Get the currently selected datasource type */
    getCurrentDataSource(): DataSourceType {
        return this.currentDataSource;
    }

    /** Switch the active datasource and notify all subscribers */
    setCurrentDataSource(ds: DataSourceType): void {
        if (this.currentDataSource !== ds) {
            this.currentDataSource = ds;
            this.listeners.forEach((fn) => fn(ds));
        }
    }

    /** Subscribe to datasource changes. Returns an unsubscribe function. */
    subscribe(listener: DataSourceChangeListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Check whether each datasource is reachable for a given snapshot.
     * Returns availability flags; errors are caught and treated as unavailable.
     */
    async checkSnapshotAvailability(
        snapshotId: string
    ): Promise<{ availability: DataSourceAvailability }> {
        const availability: DataSourceAvailability = { couchbase: false, promql: false };

        // Check Couchbase datasource health
        try {
            await getBackendSrv().get(
                `/api/datasources/uid/${CB_DATASOURCE_REF.uid}`
            );
            availability.couchbase = true;
        } catch {
            availability.couchbase = false;
        }

        // Check Prometheus datasource health
        try {
            await getBackendSrv().get(
                `/api/datasources/uid/${PROM_DATASOURCE_REF.uid}`
            );
            availability.promql = true;
        } catch {
            availability.promql = false;
        }

        return { availability };
    }
}

/** Singleton instance used across the application */
export const dataSourceService = new DataSourceService();
