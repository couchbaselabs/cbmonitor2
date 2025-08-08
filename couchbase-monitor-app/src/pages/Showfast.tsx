import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { testIds } from '../components/testIds';
import { PluginPage } from '@grafana/runtime';

function Showfast() {
  const s = useStyles2(getStyles);

  return (
    <PluginPage>
      <div data-testid={testIds.showfast.container} className={s.dashboard}>
        <div className={s.header}>
          <h1 className={s.title}>Showfast Dashboard</h1>
          <p className={s.description}>
            Welcome to the Showfast dashboard. This is a dashboard for the Showfast project.
          </p>
        </div>

        <div className={s.content}>
          <div className={s.placeholder}>
            <h3>Components</h3>
            <ul className={s.list}>
              <li>KV</li>
              <li>HIDDEN</li>
              <li>Rebalance</li>
              <li>XDCR</li>
              <li>Query</li>
              <li>Search</li>
              <li>Analytics</li>
              <li>Eventing</li>
              <li>Tools</li>
              <li>Sync Gateway</li>
              <li>SDKs</li>
              <li>FIO</li>
            </ul>
          </div>
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
    margin-bottom: 32px;
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
  content: css`
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 400px;
  `,
  placeholder: css`
    text-align: center;
    padding: 48px;
    background-color: ${theme.colors.background.secondary};
    border: 2px dashed ${theme.colors.border.weak};
    border-radius: 8px;
    max-width: 600px;
    
    h3 {
      margin: 0 0 16px 0;
      color: ${theme.colors.text.primary};
      font-size: 24px;
    }
    
    p {
      margin: 0 0 24px 0;
      color: ${theme.colors.text.secondary};
      font-size: 16px;
    }
  `,
  list: css`
    text-align: left;
    color: ${theme.colors.text.secondary};
    font-size: 14px;
    
    li {
      margin-bottom: 8px;
    }
  `,
});
