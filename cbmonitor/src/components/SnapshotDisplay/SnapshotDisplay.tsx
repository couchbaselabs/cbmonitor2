import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Card, Icon, Button, LoadingPlaceholder, Alert } from '@grafana/ui';
import { SnapshotData } from '../../types/snapshot';

interface SnapshotDisplayProps {
  snapshot: SnapshotData;
  onViewDashboard?: (dashboardId: string) => void;
}

export function SnapshotDisplay({ snapshot, onViewDashboard }: SnapshotDisplayProps) {
  const s = useStyles2(getStyles);
  const { metadata, data, dashboards } = snapshot;

  return (
    <div className={s.container}>
      <Card className={s.dashboardsCard}>
      {/* Available Dashboards */}
      {dashboards && dashboards.length > 0 && (
          <div className={s.dashboardsList}>
            {dashboards.map((dashboardId) => (
              <Button
                key={dashboardId}
                variant="secondary"
                icon="chart-line"
                onClick={() => onViewDashboard?.(dashboardId)}
                className={s.dashboardButton}
              >
                {formatDashboardName(dashboardId)}
              </Button>
            ))}
          </div>
      )}
      {/* Snapshot raw data */}
      {(() => {
        const [folded, setFolded] = React.useState(true);
        return (
          <span>
            <Button
              variant="secondary"
              icon={folded ? "angle-right" : "angle-down"}
              onClick={() => setFolded((v) => !v)}
              className={s.foldButton}
              aria-expanded={!folded}
              aria-controls="snapshot-raw-data"
              size="sm"
            >
              {folded ? "Show Raw Data" : "Hide Raw Data"}
            </Button>
            {!folded && (
              <pre id="snapshot-raw-data" className={s.dataContent}>
                {JSON.stringify(data, null, 2)}
              </pre>
            )}
          </span>
        );
      })()}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.metadataItem}>
            <span className={s.metadataLabel}>Services ({metadata.services.length}):</span>
            <span className={s.metadataValue}>{metadata.services.join(', ')}</span>
          </div>
          <div className={s.metadataItem}>
            <span className={s.metadataLabel}>Nodes ({metadata.nodes.length}):</span>
            <span className={s.metadataValue}>{metadata.nodes.join(', ')}</span>
          </div>
          <div className={s.metadataItem}>
            <span className={s.metadataLabel}>Buckets ({metadata.buckets.length}):</span>
            <span className={s.metadataValue}>{metadata.buckets.join(', ')}</span>
          </div>
          <div className={s.metadataItem}>
            <span className={s.metadataLabel}>Start Time:</span>
            <span className={s.metadataValue}>{new Date(metadata.ts_start).toLocaleString()}</span>
          </div>
          <div className={s.metadataItem}>
            <span className={s.metadataLabel}>End Time:</span>
            <span className={s.metadataValue}>{new Date(metadata.ts_end).toLocaleString()}</span>
          </div>
        </div>
      </div>
      </Card>
    </div>
  );
}

// Helper function to format dashboard names
function formatDashboardName(dashboardId: string): string {
  return dashboardId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 1400px;
    margin: 0 auto;
    padding: 24px;
  `,
  headerCard: css`
    padding: 2px;
  `,
  header: css`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;

    @media (max-width: 768px) {
      flex-direction: column;
    }
  `,
  headerLeft: css`
    display: flex;
    gap: 16px;
    align-items: flex-start;
  `,
  headerIcon: css`
    color: ${theme.colors.primary.main};
    margin-top: 4px;
  `,
  headerRight: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;

    @media (max-width: 768px) {
      align-items: flex-start;
    }
  `,
  title: css`
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: ${theme.colors.text.primary};
  `,
  description: css`
    margin: 4px 0 0 0;
    color: ${theme.colors.text.secondary};
    font-size: 14px;
  `,
  metadataItem: css`
    display: flex;
    gap: 8px;
    font-size: 14px;
  `,
  metadataLabel: css`
    color: ${theme.colors.text.secondary};
    font-weight: 500;
  `,
  metadataValue: css`
    color: ${theme.colors.text.primary};
  `,
  nodesCard: css`
    padding: 24px;
  `,
  nodesHeader: css`
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;

    h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 500;
      color: ${theme.colors.text.primary};
    }
  `,
  nodesList: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 12px;
  `,
  nodeItem: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};

    code {
      color: ${theme.colors.text.primary};
      font-size: 13px;
    }
  `,
  dashboardsCard: css`
    padding: 24px;
  `,
  dashboardsHeader: css`
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;

    h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 500;
      color: ${theme.colors.text.primary};
    }
  `,
  dashboardsList: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  `,
  dashboardButton: css`
    min-width: 150px;
  `,
  dataCard: css`
    padding: 24px;
  `,
  dataHeader: css`
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;

    h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 500;
      color: ${theme.colors.text.primary};
    }
  `,
  dataContent: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: 16px;
    margin: 0;
    overflow-x: auto;
    font-size: 13px;
    color: ${theme.colors.text.primary};
    max-height: 400px;
  `,
});
