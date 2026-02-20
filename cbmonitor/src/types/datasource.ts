/**
 * Datasource types supported by the application.
 */
export enum DataSourceType {
  Couchbase = 'couchbase',
  PromQL = 'promql',
}

/**
 * Configuration for dual-datasource support
 */
export interface DataSourceConfig {
  /** The default datasource used unless overridden */
  defaultDataSource: DataSourceType;
  /** Whether the PromQL datasource is enabled for experimentation */
  promqlEnabled: boolean;
}

/**
 * Availability status for each datasource for a given snapshot
 */
export interface DataSourceAvailability {
  couchbase: boolean;
  promql: boolean;
}
