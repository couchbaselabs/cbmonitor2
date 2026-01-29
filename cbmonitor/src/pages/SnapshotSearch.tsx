import React, { useState } from 'react';
import { css } from '@emotion/css';
import { SceneComponentProps, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Button, Input, Icon, Alert } from '@grafana/ui';
import { locationService } from '@grafana/runtime';
import { prefixRoute } from '../utils/utils.routing';
import { ROUTES } from '../constants';
import { getVersionInfo } from '../utils/utils.version';

interface SnapshotSearchSceneState extends SceneObjectState {
  errorMessage?: string;
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
  const versionInfo = getVersionInfo();

  const handleSearch = () => {
    if (searchQuery.trim()) {
      // Navigate to the same route with snapshotId query parameter
      locationService.push(prefixRoute(ROUTES.CBMonitor) + '?snapshotId=' + encodeURIComponent(searchQuery));
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
          <Icon name="chart-line" size="xxxl" className={s.icon} />
          <h1 className={s.title}>CBMonitor</h1>
        </div>

        {/* Subtitle */}
        <p className={s.subtitle}>
          Welcome to CBMonitor, a tool for monitoring and analysing Couchbase performance metrics.
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
              Search
            </Button>
          </div>
        </div>

        {/* Additional Info */}
        <div className={s.infoText}>
          Enter a snapshot ID to view performance metrics and dashboards
        </div>

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
    flex-direction: column;
    align-items: center;
    gap: 16px;
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
