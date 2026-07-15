import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { SceneComponentProps, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Button, Input, Icon, Alert } from '@grafana/ui';
import { locationService } from '@grafana/runtime';
import { prefixRoute, ROUTE_PATHS } from '../utils/utils.routing';
import { getVersionInfo } from '../utils/utils.version';
import { snapshotCacheStore, SnapshotCacheEntry } from '../services/snapshotCache';
import { snapshotService } from '../services/snapshotService';

// How many recent snapshots to show directly on the landing page.
const RECENT_SNAPSHOTS_SHOWN = 5;

interface SnapshotSearchSceneState extends SceneObjectState {
  errorMessage?: string;
}

function isValidURL(str?: string): boolean {
  if (!str) {
    return false;
  }
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 0) {
    return 'just now';
  }
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export class SnapshotSearchScene extends SceneObjectBase<SnapshotSearchSceneState> {
  public static Component = SnapshotSearchRenderer;

  public constructor(state?: Partial<SnapshotSearchSceneState>) {
    super({
      errorMessage: state?.errorMessage,
    });
  }
}

function SnapshotSearchRenderer({ model }: SceneComponentProps<SnapshotSearchScene>) {
  const { errorMessage } = model.useState();
  const s = useStyles2(getStyles);
  const [searchQuery, setSearchQuery] = useState('');
  const [cachedEntries, setCachedEntries] = useState<SnapshotCacheEntry[]>([]);
  const versionInfo = getVersionInfo();

  useEffect(() => {
    let active = true;
    const refreshList = async () => {
      const list = await snapshotCacheStore.list();
      if (active) {
        setCachedEntries(list);
      }
    };
    void refreshList();
    const unsubscribe = snapshotService.onSnapshotRefreshed(() => {
      void refreshList();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  /**
   * Handles search action by navigating to the snapshot view page with the snapshotId query parameter.
   * Uses centralized route builder for maintainability.
   */
  const handleSearch = () => {
    if (searchQuery.trim()) {
      locationService.push(prefixRoute(ROUTE_PATHS.snapshotView(searchQuery.trim())));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className={s.container}>
      <div className={s.content}>
        {/* Logo or Title */}
        <div className={s.logoContainer}>
          <Icon name="chart-line" size="xxxl" className={s.icon} title='cbmonitor' />
          <h1 className={s.title}>cbmonitor</h1>
        </div>

        {/* Subtitle */}
        <p className={s.subtitle}>
          Welcome to cbmonitor, a tool for monitoring and analysing Couchbase performance metrics.
        </p>

        {/* Error Alert */}
        {errorMessage && (
          <Alert severity="error" title="Error" className={s.errorAlert}>
            {errorMessage}
          </Alert>
        )}

        {/* Search Box */}
        <div className={s.searchContainer}>
          <div className={s.searchBox}>
            <Input
              placeholder="Enter a snapshot id ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              onKeyDown={handleKeyPress}
              className={s.searchInput}
              prefix={<Icon name="search" />}
              autoFocus
            />
            <Button size="lg" onClick={handleSearch} className={s.searchButton}>
              Go
            </Button>
          </div>
        </div>

        {/* Additional Info */}
        <div className={s.infoText}>
          Enter a snapshot ID to view performance metrics and dashboards
        </div>

        {cachedEntries.length > 0 && (
          <div className={s.recentContainer}>
            <div className={s.recentHeader}>
              <Icon name="history" size="sm" />
              Recent snapshots
            </div>
            <div className={s.recentList}>
              {cachedEntries.slice(0, RECENT_SNAPSHOTS_SHOWN).map((entry) => {
                const label = entry.metadata.label;
                const labelIsUrl = isValidURL(label);
                return (
                  <button
                    key={entry.snapshotId}
                    type="button"
                    className={s.recentRow}
                    onClick={() => locationService.push(prefixRoute(ROUTE_PATHS.snapshotView(entry.snapshotId)))}
                    title={`Open ${entry.snapshotId}`}
                  >
                    <span className={s.recentId}>{entry.snapshotId}</span>
                    {label && (
                      <span className={labelIsUrl ? `${s.recentLabel} ${s.truncateStart}` : s.recentLabel}>
                        <bdi>{label}</bdi>
                      </span>
                    )}
                    <span className={s.recentTime}>{formatRelative(entry.lastAccessedAt)}</span>
                  </button>
                );
              })}
            </div>
            {cachedEntries.length > RECENT_SNAPSHOTS_SHOWN && (
              <button
                type="button"
                className={s.cacheLink}
                onClick={() => locationService.push(prefixRoute(ROUTE_PATHS.preferences()))}
              >
                View all {cachedEntries.length} cached snapshots
              </button>
            )}
          </div>
        )}

        {/* Version Information */}
        <div className={s.versionInfo}>
          <div className={s.versionItem}>
            <span className={s.versionLabel}>Version:</span>
            <span className={s.versionValue}>{versionInfo.version}</span>
          </div>
          <div className={s.versionItem}>
            <span className={s.versionLabel}>Commit:</span>
            <span className={s.versionValue}>{versionInfo.gitCommit}</span>
          </div>
          <div className={s.versionItem}>
            <span className={s.versionLabel}>Built:</span>
            <span className={s.versionValue}>{versionInfo.buildDate}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    background: ${theme.colors.background.primary};
    padding: 24px;
  `,
  content: css`
    text-align: center;
    max-width: 800px;
    width: 100%;
  `,
  logoContainer: css`
    margin-bottom: 24px;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 12px;
  `,
  icon: css`
    color: ${theme.colors.primary.main};
  `,
  title: css`
    font-size: 48px;
    font-weight: 600;
    color: ${theme.colors.text.primary};
    margin: 0;
    letter-spacing: -0.5px;
  `,
  subtitle: css`
    font-size: 18px;
    color: ${theme.colors.text.secondary};
    margin: 0 0 32px 0;
    line-height: 1.5;
  `,
  errorAlert: css`
    margin-bottom: 24px;
    text-align: left;
  `,
  searchContainer: css`
    margin-bottom: 16px;
  `,
  searchBox: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
  `,
  searchInput: css`
    flex: 1;
    min-width: 300px;
    max-width: 600px;

    input {
      font-size: 16px;
      padding: 12px 16px;
      height: 48px;
    }
  `,
  searchButton: css`
    height: 48px;
    padding: 0 32px;
    font-size: 16px;
  `,
  infoText: css`
    font-size: 14px;
    color: ${theme.colors.text.secondary};
    margin-top: 8px;
  `,
  cacheLink: css`
    background: none;
    border: none;
    margin-top: 12px;
    padding: 6px 12px;
    color: ${theme.colors.text.link};
    font-size: 14px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: ${theme.shape.radius.default};
    &:hover {
      background: ${theme.colors.background.secondary};
      text-decoration: underline;
    }
  `,
  recentContainer: css`
    margin-top: 24px;
    width: 100%;
    max-width: 600px;
    text-align: left;
  `,
  recentHeader: css`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: ${theme.colors.text.secondary};
    margin-bottom: 8px;
  `,
  recentList: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  recentRow: css`
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: 8px 12px;
    cursor: pointer;
    text-align: left;
    &:hover {
      background: ${theme.colors.action.hover};
      border-color: ${theme.colors.border.medium};
    }
  `,
  recentId: css`
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: 13px;
    color: ${theme.colors.text.primary};
    flex-shrink: 0;
  `,
  recentLabel: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    color: ${theme.colors.text.secondary};
  `,
  truncateStart: css`
    direction: rtl;
    text-align: left;
  `,
  recentTime: css`
    flex-shrink: 0;
    font-size: 12px;
    color: ${theme.colors.text.secondary};
  `,
  versionInfo: css`
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid ${theme.colors.border.weak};
    display: flex;
    flex-wrap: wrap;
    gap: 16px 24px;
    justify-content: center;
    align-items: center;
    font-size: 12px;
    color: ${theme.colors.text.secondary};
  `,
  versionItem: css`
    display: flex;
    align-items: center;
    gap: 6px;
  `,
  versionLabel: css`
    font-weight: 500;
    color: ${theme.colors.text.secondary};
  `,
  versionValue: css`
    font-family: ${theme.typography.fontFamilyMonospace};
    color: ${theme.colors.text.primary};
    background: ${theme.colors.background.secondary};
    padding: 2px 6px;
    border-radius: 3px;
  `,
});
