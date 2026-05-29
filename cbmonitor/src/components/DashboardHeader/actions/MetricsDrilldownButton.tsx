import React, { useEffect, useState } from 'react';
import { SceneTimeRange } from '@grafana/scenes';
import { config } from '@grafana/runtime';
import { ToolbarButton } from '@grafana/ui';
import { dataSourceService } from '../../../services/datasourceService';
import { DataSourceType } from '../../../types/datasource';
import {
    buildMetricsDrilldownUrl,
    METRICS_DRILLDOWN_PLUGIN_ID,
} from '../../../utils/metricsDrilldownUrl';
import { openInNewTab } from '../../../utils/openInNewTab';

interface MetricsDrilldownButtonProps {
    snapshotId: string;
    timeRange: SceneTimeRange;
}

function isMetricsDrilldownAppInstalled(): boolean {
    const apps = (config as { apps?: Record<string, unknown> }).apps;
    return Boolean(apps && apps[METRICS_DRILLDOWN_PLUGIN_ID]);
}

export function MetricsDrilldownButton({ snapshotId, timeRange }: MetricsDrilldownButtonProps) {
    const [ds, setDs] = useState<DataSourceType>(dataSourceService.getCurrentDataSource());

    useEffect(() => {
        return dataSourceService.subscribe(setDs);
    }, []);

    const { value } = timeRange.useState();
    const promAvailable = ds === DataSourceType.Prometheus;
    const appInstalled = isMetricsDrilldownAppInstalled();

    if (!appInstalled) {
        return null;
    }

    const onClick = () => {
        if (!promAvailable) {
            return;
        }
        const url = buildMetricsDrilldownUrl({
            snapshotId,
            range: { from: String(value.raw.from), to: String(value.raw.to) },
        });
        openInNewTab(url);
    };

    return (
        <ToolbarButton
            icon="compass"
            tooltip={
                promAvailable
                    ? 'Open Grafana Metrics Drilldown scoped to this snapshot (Prometheus). Time range and job label are pre-filled.'
                    : 'Metrics Drilldown is only available when the Prometheus data source is selected.'
            }
            aria-label="Open in Metrics Drilldown"
            onClick={onClick}
            disabled={!promAvailable}
        >
            Drilldown
        </ToolbarButton>
    );
}
