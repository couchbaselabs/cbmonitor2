import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, TabsBar, Tab, TabContent } from '@grafana/ui';
import { testIds } from '../components/testIds';
import { PluginPage } from '@grafana/runtime';

// Define the available components as tabs
const COMPONENTS = [
  { id: 'kv', label: 'KV', icon: 'database' },
  {id: 'hidd', label: 'HiDD', icon: 'hdd'},
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

  const renderTabContent = (componentId: ComponentId) => {
    const component = COMPONENTS.find(c => c.id === componentId);

    return (
      <div className={s.tabContent}>
        <div className={s.contentHeader}>
          <h2>{component?.label} Dashboard</h2>
          <p>Monitor and analyze {component?.label.toLowerCase()} performance and metrics.</p>
        </div>

        <div className={s.placeholder}>
          <h3>{component?.label} Metrics</h3>
          <div className={s.metricsGrid}>
            <div className={s.metricCard}>
              <h4>Metrics 1</h4>
              <p>performance data will be displayed here</p>
            </div>
            <div className={s.metricCard}>
              <h4>Metrics 2</h4>
              <p>performance data will be displayed here</p>
            </div>
            <div className={s.metricCard}>
              <h4>Metrics 3</h4>
              <p>performance data will be displayed here</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <PluginPage>
      <div data-testid={testIds.showfast.container} className={s.dashboard}>
        <div className={s.header}>
          <h2 className={s.title}>Showfast Dashboard</h2>
        </div>

        <div className={s.tabsContainer}>
          <TabsBar className={s.tabsBar}>
            {COMPONENTS.map((component) => (
              <Tab
                key={component.id}
                label={component.label}
                active={activeTab === component.id}
                onChangeTab={() => setActiveTab(component.id)}
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
  placeholder: css`
    padding: 24px;
    background-color: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: 8px;

    h3 {
      margin: 0 0 20px 0;
      color: ${theme.colors.text.primary};
      font-size: 18px;
      text-align: center;
    }
  `,
  metricsGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
    margin-top: 16px;
  `,
  metricCard: css`
    padding: 16px;
    background-color: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: 6px;

    h4 {
      margin: 0 0 8px 0;
      color: ${theme.colors.text.primary};
      font-size: 16px;
      font-weight: 500;
    }

    p {
      margin: 0;
      color: ${theme.colors.text.secondary};
      font-size: 14px;
      line-height: 1.4;
    }
  `,
});
