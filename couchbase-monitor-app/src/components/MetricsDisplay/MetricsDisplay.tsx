import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Spinner, Alert, Button, Select, Badge } from '@grafana/ui';
import { ComponentMetrics } from '../../types/metrics';

interface MetricsDisplayProps {
  metrics: ComponentMetrics | null;
  loading: boolean;
  error: string | null;
  onRefetch: () => void;
}

export const MetricsDisplay: React.FC<MetricsDisplayProps> = ({
  metrics,
  loading,
  error,
  onRefetch
}) => {
  const s = useStyles2(getStyles);
  const [selectedMetric, setSelectedMetric] = useState<string>('');

  if (loading) {
    return (
      <div className={s.loadingContainer}>
        <Spinner size="lg" />
        <p>Loading metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert title="Error Loading Metrics" severity="error">
        <p>{error}</p>
        <Button onClick={onRefetch} variant="secondary" size="sm">
          Retry
        </Button>
      </Alert>
    );
  }

  if (!metrics || !metrics.metrics.length) {
    return (
      <div className={s.emptyState}>
        <p>No metrics available for this component.</p>
        <Button onClick={onRefetch} variant="secondary">
          Refresh
        </Button>
      </div>
    );
  }

  // Prepare select options
  const metricOptions = metrics.metrics.map(metric => ({
    label: metric.name,
    value: metric.id,
    description: metric.description
  }));

  // Get selected metric data
  const currentMetric = metrics.metrics.find(m => m.id === selectedMetric) || metrics.metrics[0];

  // Calculate performance indicators
  const latestValue = currentMetric.values[currentMetric.values.length - 1];
  const previousValue = currentMetric.values[currentMetric.values.length - 2];
  const trend = latestValue && previousValue
    ? ((latestValue.value - previousValue.value) / previousValue.value) * 100
    : 0;

  return (
    <div className={s.container}>
      {/* Header with metric selector and stats */}
      <div className={s.header}>
        <div className={s.metricSelector}>
          <label htmlFor="metric-select">Select Metric:</label>
          <Select
            inputId="metric-select"
            options={metricOptions}
            value={selectedMetric || metricOptions[0]?.value}
            onChange={(option) => setSelectedMetric(option?.value || '')}
            placeholder="Choose a metric..."
            width="auto"
          />
        </div>

        <div className={s.metricStats}>
          <div className={s.statItem}>
            <span className={s.statLabel}>Latest Value:</span>
            <span className={s.statValue}>
              {latestValue?.value.toFixed(2)} {currentMetric.unit}
            </span>
          </div>

          {trend !== 0 && (
            <div className={s.statItem}>
              <span className={s.statLabel}>Trend:</span>
              <Badge 
                text={`${trend > 0 ? '+' : ''}${trend.toFixed(1)}%`}
                color={trend > 0 ? 'green' : 'red'}
              />
            </div>
          )}

          <div className={s.statItem}>
            <span className={s.statLabel}>Category:</span>
            <Badge text={currentMetric.category} color="blue" />
          </div>
        </div>
      </div>

      {/* Metric description */}
      <div className={s.description}>
        <h4>{currentMetric.name}</h4>
        <p>{currentMetric.description}</p>
      </div>

      {/* Data table */}
      <div className={s.tableContainer}>
        <div className={s.tableHeader}>
          <h5>Performance Data Across Versions</h5>
          <Button onClick={onRefetch} variant="secondary" size="sm" icon="sync">
            Refresh
          </Button>
        </div>

        <div className={s.customTable}>
          <div className={s.tableHeaderRow}>
            <div className={s.tableHeaderCell}>Version</div>
            <div className={s.tableHeaderCell}>Value</div>
            <div className={s.tableHeaderCell}>Build</div>
            <div className={s.tableHeaderCell}>Date</div>
          </div>

          {currentMetric.values.map((value, index) => (
            <div key={index} className={s.tableRow}>
              <div className={s.tableCell}>
                <Badge text={value.version} color="blue" />
              </div>
              <div className={s.tableCell}>
                <div className={s.valueCell}>
                  <span className={s.value}>{value.value.toFixed(2)}</span>
                  <span className={s.unit}>{currentMetric.unit}</span>
                </div>
              </div>
              <div className={s.tableCell}>
                {value.buildNumber || 'N/A'}
              </div>
              <div className={s.tableCell}>
                {new Date(value.timestamp || '').toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer info */}
      <div className={s.footer}>
        <small>
          Last updated: {new Date(metrics.lastUpdated).toLocaleString()}
          {' • '}
          Component: {metrics.componentName}
          {' • '}
          Total metrics: {metrics.metrics.length}
        </small>
      </div>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    padding: 16px;
    background-color: ${theme.colors.background.primary};
  `,

  loadingContainer: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    gap: 16px;
    color: ${theme.colors.text.secondary};
  `,

  emptyState: css`
    text-align: center;
    padding: 48px;
    color: ${theme.colors.text.secondary};

    p {
      margin-bottom: 16px;
    }
  `,

  header: css`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 16px;
  `,

  metricSelector: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 300px;

    label {
      font-weight: 500;
      color: ${theme.colors.text.primary};
    }
  `,

  metricStats: css`
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  `,

  statItem: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
  `,

  statLabel: css`
    font-size: 12px;
    color: ${theme.colors.text.secondary};
    text-transform: uppercase;
    font-weight: 500;
  `,

  statValue: css`
    font-size: 16px;
    font-weight: 500;
    color: ${theme.colors.text.primary};
  `,

  description: css`
    margin-bottom: 24px;
    padding: 16px;
    background-color: ${theme.colors.background.secondary};
    border-radius: 4px;
    border-left: 4px solid ${theme.colors.primary.main};

    h4 {
      margin: 0 0 8px 0;
      color: ${theme.colors.text.primary};
    }

    p {
      margin: 0;
      color: ${theme.colors.text.secondary};
      font-size: 14px;
    }
  `,

  tableContainer: css`
    background-color: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: 4px;
    overflow: hidden;
  `,

  tableHeader: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid ${theme.colors.border.weak};

    h5 {
      margin: 0;
      color: ${theme.colors.text.primary};
    }
  `,

  customTable: css`
    width: 100%;
  `,

  tableHeaderRow: css`
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 16px;
    padding: 12px 16px;
    background-color: ${theme.colors.background.canvas};
    border-bottom: 2px solid ${theme.colors.border.medium};
    font-weight: 600;
    color: ${theme.colors.text.primary};
    font-size: 14px;
  `,

  tableHeaderCell: css`
    text-align: left;
  `,

  tableRow: css`
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 16px;
    padding: 12px 16px;
    border-bottom: 1px solid ${theme.colors.border.weak};

    &:hover {
      background-color: ${theme.colors.background.secondary};
    }

    &:last-child {
      border-bottom: none;
    }
  `,

  tableCell: css`
    display: flex;
    align-items: center;
    color: ${theme.colors.text.secondary};
    font-size: 14px;
  `,

  valueCell: css`
    display: flex;
    align-items: baseline;
    gap: 4px;
  `,

  value: css`
    font-weight: 500;
    color: ${theme.colors.text.primary};
  `,

  unit: css`
    font-size: 12px;
    color: ${theme.colors.text.secondary};
  `,

  footer: css`
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid ${theme.colors.border.weak};
    text-align: center;
    color: ${theme.colors.text.secondary};
  `,
});
