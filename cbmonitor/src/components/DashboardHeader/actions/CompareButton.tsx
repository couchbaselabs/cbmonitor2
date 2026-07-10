import React from 'react';
import { ToolbarButton } from '@grafana/ui';
import { locationService } from '@grafana/runtime';
import { prefixRoute, ROUTE_PATHS } from '../../../utils/utils.routing';

interface CompareButtonProps {
    snapshotId: string;
}

export function CompareButton({ snapshotId }: CompareButtonProps) {
    const onClick = () => {
        locationService.push(prefixRoute(ROUTE_PATHS.compareSnapshots([snapshotId])));
    };

    return (
        <ToolbarButton
            icon="columns"
            tooltip="Compare this snapshot with another"
            aria-label="Compare"
            onClick={onClick}
        >
            Compare
        </ToolbarButton>
    );
}
