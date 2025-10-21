import React, { useState } from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Button, Input, Icon, LoadingPlaceholder, Alert } from '@grafana/ui';
import { PluginPage } from '@grafana/runtime';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { prefixRoute } from '../utils/utils.routing';
import { ROUTES } from '../constants';
import { testIds } from '../components/testIds';
import { useSnapshot } from '../hooks/useSnapshot';
import { SnapshotDisplay } from '../components/SnapshotDisplay/SnapshotDisplay';

function CBMonitor() {
  const s = useStyles2(getStyles);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');

  // Get snapshotId from URL query parameters
  const snapshotId = searchParams.get('snapshotId');

  // Fetch snapshot data if snapshotId is present
  const { snapshot, loading, error, refetch } = useSnapshot(snapshotId);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      // Navigate to cbmonitor page with snapshotId query parameter
      navigate(prefixRoute(ROUTES.CBMonitor + '?snapshotId=' + encodeURIComponent(searchQuery)));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleNewSearch = () => {
    // Clear the snapshot and return to search
    navigate(prefixRoute(ROUTES.CBMonitor));
  };

  const handleViewDashboard = (dashboardUid: string) => {
    // Navigate to Grafana dashboard
    // Grafana dashboards are at /d/{uid}
    window.location.href = `/d/${dashboardUid}`;
  };

  // Show loading state
  if (loading) {
    return (
      <PluginPage>
        <div className={s.container}>
          <LoadingPlaceholder text="Loading snapshot data..." />
        </div>
      </PluginPage>
    );
  }

  // Show error state
  if (error && snapshotId) {
    return (
      <PluginPage>
        <div className={s.container}>
          <Alert severity="error" title="Error loading snapshot">
            {error}
          </Alert>
          <Button icon="arrow-left" onClick={handleNewSearch} className={s.backButton}>
            Back to Search
          </Button>
        </div>
      </PluginPage>
    );
  }

  // Show snapshot data if loaded
  if (snapshot) {
    return (
      <PluginPage>
        <div className={s.snapshotContainer}>
          <SnapshotDisplay
            snapshot={snapshot}
            onViewDashboard={handleViewDashboard}
          />
        </div>
      </PluginPage>
    );
  }

  // Default: Show search interface
  return (
    <PluginPage>
      <div className={s.container} data-testid={testIds.home.container}>
        <div className={s.content}>
          {/* Logo or Title */}
          <div className={s.logoContainer}>
            <Icon name="chart-line" size="xl" className={s.icon} />
            <h1 className={s.title}>CBMonitor</h1>
          </div>

          {/* Subtitle */}
          <p className={s.subtitle}>
            Welcome to CBMonitor, a tool for monitoring and analysing Couchbase performance metrics.
          </p>

          {/* Search Box */}
          <div className={s.searchContainer}>
            <div className={s.searchBox}>
              <Input
                placeholder="Enter a snapshot id ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                onKeyPress={handleKeyPress}
                className={s.searchInput}
                prefix={<Icon name="search" />}
                autoFocus
                data-testid={testIds.home.searchInput}
              />
              <Button 
                size="lg" 
                onClick={handleSearch}
                className={s.searchButton}
                data-testid={testIds.home.searchButton}
              >
                Search
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PluginPage>
  );
}

export default CBMonitor;

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - 100px);
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
    margin: 0 0 48px 0;
    line-height: 1.5;
  `,
  searchContainer: css`
    margin-bottom: 32px;
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
  quickLinks: css`
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 24px;
  `,
  snapshotContainer: css`
    background: ${theme.colors.background.primary};
    min-height: calc(100vh - 100px);
  `,
  snapshotHeader: css`
    display: flex;
    gap: 12px;
    padding: 16px 24px;
    background: ${theme.colors.background.secondary};
    border-bottom: 1px solid ${theme.colors.border.weak};
  `,
  backButton: css`
    margin-bottom: 16px;
  `,
});
