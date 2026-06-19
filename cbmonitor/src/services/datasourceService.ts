import { DataSourceType, DataSourceConfig } from '../types/datasource';
import { API_BASE_URL } from '../constants';

type DataSourceChangeListener = (dataSource: DataSourceType) => void;

/**
 * Singleton service for managing which datasource (Couchbase SQL++ vs Prometheus) is active.
 */
class DataSourceService {
    private currentDataSource: DataSourceType = DataSourceType.Prometheus;
    private config: DataSourceConfig = {
        defaultDataSource: DataSourceType.Prometheus,
        prometheusAvailable: true,
        couchbaseAvailable: false,
    };
    private listeners: Set<DataSourceChangeListener> = new Set();
    private configInitialized = false;

    /**
     * Initialize datasource configuration from backend.
     */
    async initializeConfig(): Promise<DataSourceConfig> {
        if (this.configInitialized) {
            return this.config;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/config/datasources`);
            if (!response.ok) {
                console.warn(`[DataSourceService] Failed to fetch datasource config: ${response.status}. Using defaults.`);
                this.configInitialized = true;
                return this.config;
            }

            const data = await response.json();

            // Update config with backend values
            this.config.prometheusAvailable = data.prometheusAvailable ?? true;
            this.config.couchbaseAvailable = data.couchbaseAvailable ?? false;
            this.config.defaultDataSource = data.defaultDataSource ?? DataSourceType.Prometheus;

            // Set initial datasource based on availability
            const preferredDataSource = this.config.defaultDataSource;
            const isPreferredAvailable =
                (preferredDataSource === DataSourceType.Prometheus && this.config.prometheusAvailable) ||
                (preferredDataSource === DataSourceType.Couchbase && this.config.couchbaseAvailable);
            const fallbackDataSource = this.config.prometheusAvailable
                ? DataSourceType.Prometheus
                : DataSourceType.Couchbase;
            const nextDataSource = isPreferredAvailable ? preferredDataSource : fallbackDataSource;

            this.currentDataSource = nextDataSource;
            this.configInitialized = true;
        } catch (error) {
            console.error('[DataSourceService] Failed to initialize config from backend; using defaults:', error);
            this.configInitialized = true;
        }

        return this.config;
    }

    /**
     * The active datasource is pinned to Prometheus: the single gateway
     * datasource speaks PromQL, and the Couchbase-vs-Prometheus runtime toggle
     * has been retired. (This service is removed entirely in a later step.)
     */
    getCurrentDataSource(): DataSourceType {
        return DataSourceType.Prometheus;
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
     * Return datasource config used to determine which options are shown.
     */
    async getDataSourceConfig(): Promise<DataSourceConfig> {
        return this.config;
    }
}

/** Singleton instance used across the application */
export const dataSourceService = new DataSourceService();
