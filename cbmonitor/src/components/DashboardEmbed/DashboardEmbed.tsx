import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Alert, Button } from '@grafana/ui';
import { SnapshotMetadata } from '../../types/snapshot';

interface DashboardEmbedProps {
  dashboardUid: string;
  metadata: SnapshotMetadata;
  title?: string;
  height?: string;
}

export function DashboardEmbed({ dashboardUid, metadata, title, height = '600px' }: DashboardEmbedProps) {
  const s = useStyles2(getStyles);
  const [embedError, setEmbedError] = useState(false);

  // Build dashboard URL with variables from metadata
  const dashboardUrl = useMemo(() => {
    const baseUrl = `/d/${dashboardUid}`;
    const params = new URLSearchParams();

    // Set time range from snapshot metadata
    const from = new Date(metadata.ts_start).getTime();
    const to = new Date(metadata.ts_end).getTime();
    params.set('from', from.toString());
    params.set('to', to.toString());

    // Pass snapshot ID as a variable
    params.set('var-snapshot_id', metadata.snapshotId);

    // Pass nodes as variables (assuming dashboard has a node variable)
    if (metadata.nodes && metadata.nodes.length > 0) {
      // For multiple nodes, use Grafana's multi-value variable format
      metadata.nodes.forEach((node) => {
        params.append('var-nodes', node);
      });
    }

    // Pass buckets as variables
    if (metadata.buckets && metadata.buckets.length > 0) {
      metadata.buckets.forEach((bucket) => {
        params.append('var-buckets', bucket);
      });
    }

    // Pass services as variables
    if (metadata.services && metadata.services.length > 0) {
      metadata.services.forEach((service) => {
        params.append('var-services', service);
      });
    }

    // Kiosk mode for clean embedding (removes top navigation)
    params.set('kiosk', 'tv');

    // Theme
    params.set('theme', 'dark');

    return `${baseUrl}?${params.toString()}`;
  }, [dashboardUid, metadata]);

  const openInNewWindow = () => {
    window.open(dashboardUrl, '_blank');
  };

  return (
    <div className={s.container}>
      {title && <div className={s.title}>{title}</div>}

      {embedError ? (
        <Alert severity="warning" title="Dashboard Embedding Disabled">
          <div className={s.errorContent}>
            <p>
              Grafana's security settings prevent embedding dashboards.

              To view this dashboard, you can either:
            </p>
          </div>
        </Alert>
      ) : (
        <iframe
          src={dashboardUrl}
          className={s.iframe}
          style={{ height }}
          title={title || `Dashboard ${dashboardUid}`}
          frameBorder="0"
          onError={() => setEmbedError(true)}
        />
      )}

      {!embedError && (
        <div className={s.fallbackLink}>
          <Button
            variant="secondary"
            size="sm"
            icon="external-link-alt"
            onClick={openInNewWindow}
          >
            Open in New Window
          </Button>
        </div>
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  title: css`
    font-size: 16px;
    font-weight: 500;
    color: ${theme.colors.text.primary};
    padding: 8px 0;
  `,
  iframe: css`
    width: 100%;
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    background: ${theme.colors.background.primary};
  `,
  errorContent: css`
    p {
      margin: 8px 0;
    }
    ol {
      margin: 12px 0;
      padding-left: 20px;

      li {
        margin: 12px 0;
      }
    }
    code {
      background: ${theme.colors.background.secondary};
      padding: 2px 6px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 13px;
    }
  `,
  helpText: css`
    font-size: 13px;
    color: ${theme.colors.text.secondary};
    margin-top: 12px;
  `,
  openButton: css`
    margin-top: 8px;
  `,
  fallbackLink: css`
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  `,
});
