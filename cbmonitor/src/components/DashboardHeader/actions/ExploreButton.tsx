import React, { useEffect, useState } from 'react';
import { SceneTimeRange } from '@grafana/scenes';
import { ToolbarButton } from '@grafana/ui';
import { dataSourceService } from '../../../services/datasourceService';
import { DataSourceType } from '../../../types/datasource';
import { buildExploreUrl } from '../../../utils/exploreUrl';
import { openInNewTab } from '../../../utils/openInNewTab';

interface ExploreButtonProps {
    snapshotId: string;
    timeRange: SceneTimeRange;
}

export function ExploreButton({ snapshotId, timeRange }: ExploreButtonProps) {
    const [ds, setDs] = useState<DataSourceType>(dataSourceService.getCurrentDataSource());

    useEffect(() => {
        return dataSourceService.subscribe(setDs);
    }, []);

    const { value } = timeRange.useState();
    const promAvailable = ds === DataSourceType.Prometheus;

    const onClick = () => {
        if (!promAvailable) {
            return;
        }
        const url = buildExploreUrl({
            snapshotIds: snapshotId,
            range: { from: String(value.raw.from), to: String(value.raw.to) },
        });
        openInNewTab(url);
    };

    return (
        <ToolbarButton
            icon="compass"
            tooltip={
                promAvailable
                    ? 'Open Grafana Explore scoped to this snapshot (Prometheus). Time range and job label are pre-filled.'
                    : 'Explore is only available when the Prometheus data source is selected.'
            }
            aria-label="Open in Explore"
            onClick={onClick}
            disabled={!promAvailable}
        >
            Explore
        </ToolbarButton>
    );
}
