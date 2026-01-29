/**
 * Version information utility
 * These values are injected at build time via webpack DefinePlugin
 */

// Type definitions for build-time constants injected by webpack DefinePlugin
// These are replaced with string literals at build time
declare const process: {
  env: {
    APP_VERSION: string;
    GIT_COMMIT: string;
    BUILD_DATE: string;
  };
};

export interface VersionInfo {
  version: string;
  gitCommit: string;
  buildDate: string;
}

/**
 * Get version information injected at build time
 */
export function getVersionInfo(): VersionInfo {
  const version = (process.env.APP_VERSION as string) || '0.0.1';
  const gitCommit = (process.env.GIT_COMMIT as string) || 'unknown';
  const buildDate = (process.env.BUILD_DATE as string) || 'unknown';

  return {
    version,
    gitCommit,
    buildDate,
  };
}
