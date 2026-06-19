import React from 'react';
import { SceneTimeRange } from '@grafana/scenes';
import { ToolbarButton } from '@grafana/ui';
import { buildExploreUrl } from '../../../utils/exploreUrl';
import { openInNewTab } from '../../../utils/openInNewTab';

interface ExploreButtonProps {
    snapshotId: string;
    timeRange: SceneTimeRange;
}

export function ExploreButton({ snapshotId, timeRange }: ExploreButtonProps) {
    const { value } = timeRange.useState();

    const onClick = () => {
        const url = buildExploreUrl({
            snapshotIds: snapshotId,
            range: { from: String(value.raw.from), to: String(value.raw.to) },
        });
        openInNewTab(url);
    };

    return (
        <ToolbarButton
            icon="compass"
            tooltip="Open Grafana Explore scoped to this snapshot. Time range and job label are pre-filled."
            aria-label="Open in Explore"
            onClick={onClick}
        >
            Explore
        </ToolbarButton>
    );
}
