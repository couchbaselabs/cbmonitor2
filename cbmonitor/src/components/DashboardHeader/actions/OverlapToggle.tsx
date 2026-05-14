import React from 'react';
import { ToolbarButton } from '@grafana/ui';

interface OverlapToggleProps {
    active: boolean;
    onToggle: () => void;
}

export function OverlapToggle({ active, onToggle }: OverlapToggleProps) {
    return (
        <ToolbarButton
            icon="layer-group"
            tooltip={
                active
                    ? 'Overlap mode: snapshots aligned on a shared elapsed-time axis. Click to disable.'
                    : 'Enable overlap mode to align snapshots on a shared elapsed-time axis.'
            }
            aria-label="Toggle overlap mode"
            onClick={onToggle}
            variant={active ? 'active' : 'default'}
        >
            Overlap
        </ToolbarButton>
    );
}
