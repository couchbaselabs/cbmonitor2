import React, { useState } from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Button, Input, Icon } from '@grafana/ui';
import { PluginPage } from '@grafana/runtime';
import { useNavigate } from 'react-router-dom';
import { prefixRoute } from '../utils/utils.routing';
import { ROUTES } from '../constants';
import { testIds } from '../components/testIds';

function CBMonitor() {
  const s = useStyles2(getStyles);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = () => {
    if (searchQuery.trim()) {
      // Navigate to showfast page with search query
      navigate(prefixRoute(ROUTES.CBMonitor + '?snapshotId=' + searchQuery));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

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
            Welcome to CBMonitor, a tool for monitoring and analyzing Couchbase performance metrics.
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
});

