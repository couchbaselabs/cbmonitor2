import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, TabsBar, Tab, TabContent } from '@grafana/ui';
import { testIds } from '../components/testIds';
import { PluginPage } from '@grafana/runtime';
import { useMetrics } from '../hooks/useMetrics';
import { MetricsDisplay } from '../components/MetricsDisplay/MetricsDisplay';

// Define the available components as tabs
const COMPONENTS = [
  { id: 'kv', label: 'KV', icon: 'database' },
  { id: 'hidd', label: 'HiDD', icon: 'database'},
  { id: 'rebalance', label: 'Rebalance', icon: 'repeat' },
  { id: 'xdcr', label: 'XDCR', icon: 'sync' },
  { id: 'query', label: 'Query', icon: 'table' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'analytics', label: 'Analytics', icon: 'chart-line' },
  { id: 'eventing', label: 'Eventing', icon: 'bolt' },
  { id: 'tools', label: 'Tools', icon: 'cog' },
  { id: 'sync-gateway', label: 'Sync Gateway', icon: 'sync-slash' },
  { id: 'mobile', label: 'Mobile', icon: 'mobile-android' },
  { id: 'sdks', label: 'SDKs', icon: 'apps' },
  { id: 'fio', label: 'FIO', icon: 'play' },
] as const;

type ComponentId = typeof COMPONENTS[number]['id'];

function Showfast() {
  const s = useStyles2(getStyles);
  const [activeTab, setActiveTab] = useState<ComponentId>('kv');

  // Fetch metrics for the currently active tab
  const { metrics, loading, error, refetch } = useMetrics(activeTab);

  const renderTabContent = (componentId: ComponentId) => {

    return (
      <div className={s.tabContent}>
        {/* Real metrics display */}
        <MetricsDisplay
          metrics={metrics}
          loading={loading}
          error={error}
          onRefetch={refetch}
        />
      </div>
    );
  };

  return (
    <PluginPage>
      <div data-testid={testIds.showfast.container} className={s.dashboard}>
        <div className={s.tabsContainer}>
          <TabsBar className={s.tabsBar}>
            {COMPONENTS.map((component) => (
              <Tab
                key={component.id}
                label={component.label}
                active={activeTab === component.id}
                onChangeTab={() => {
                  setActiveTab(component.id);
                  // Data will be automatically fetched by the useMetrics hook
                }}
                icon={component.icon}
              />
            ))}
          </TabsBar>

          <TabContent className={s.tabContentWrapper}>
            {renderTabContent(activeTab)}
          </TabContent>
        </div>
      </div>
    </PluginPage>
  );
}

export default Showfast;

const getStyles = (theme: GrafanaTheme2) => ({
  dashboard: css`
    padding: 24px;
    background-color: ${theme.colors.background.primary};
    min-height: 100vh;
  `,
  header: css`
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid ${theme.colors.border.weak};
  `,
  title: css`
    margin: 0 0 8px 0;
    color: ${theme.colors.text.primary};
    font-size: 32px;
    font-weight: 500;
  `,
  description: css`
    margin: 0;
    color: ${theme.colors.text.secondary};
    font-size: 16px;
    line-height: 1.4;
  `,
  tabsContainer: css`
    background-color: ${theme.colors.background.primary};
  `,
  tabsBar: css`
    margin-bottom: 16px;
    border-bottom: 1px solid ${theme.colors.border.weak};
  `,
  tabContentWrapper: css`
    min-height: 500px;
  `,
  tabContent: css`
    padding: 16px 0;
  `,
  contentHeader: css`
    margin-bottom: 24px;

    h2 {
      margin: 0 0 8px 0;
      color: ${theme.colors.text.primary};
      font-size: 24px;
      font-weight: 500;
    }

    p {
      margin: 0;
      color: ${theme.colors.text.secondary};
      font-size: 14px;
    }
  `,

});
