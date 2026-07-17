import React from 'react';
import { SceneTimeRange } from '@grafana/scenes';
import { config } from '@grafana/runtime';
import { ToolbarButton } from '@grafana/ui';
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
    const { value } = timeRange.useState();

    if (!isMetricsDrilldownAppInstalled()) {
        return null;
    }

    const onClick = () => {
        const url = buildMetricsDrilldownUrl({
            snapshotId,
            range: { from: String(value.raw.from), to: String(value.raw.to) },
        });
        openInNewTab(url);
    };

    return (
        <ToolbarButton
            icon="compass"
            tooltip="Open Grafana Metrics Drilldown scoped to this snapshot. Time range and job label are pre-filled."
            aria-label="Open in Metrics Drilldown"
            onClick={onClick}
        >
            Drilldown
        </ToolbarButton>
    );
}
