/**
 * Datasource types supported by the application.
 */
export enum DataSourceType {
    Couchbase = 'couchbase',
    Prometheus = 'prometheus',
}

/**
 * Configuration for dual-datasource support, including visibility per deployment.
 */
export interface DataSourceConfig {
    /** The default datasource used unless overridden */
    defaultDataSource: DataSourceType;
    /** Whether Couchbase is available in the UI selector */
    couchbaseAvailable: boolean;
    /** Whether Prometheus is available in the UI selector */
    prometheusAvailable: boolean;
}
