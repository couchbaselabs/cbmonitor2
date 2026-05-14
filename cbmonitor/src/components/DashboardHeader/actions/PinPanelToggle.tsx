import React from 'react';
import { ToolbarButton } from '@grafana/ui';

interface PinPanelToggleProps {
    pinnedPanelTitle?: string | null;
    onUnpin?: () => void;
}

export function PinPanelToggle({ pinnedPanelTitle, onUnpin }: PinPanelToggleProps) {
    const isPinned = Boolean(pinnedPanelTitle);

    return (
        <ToolbarButton
            icon="gf-pin"
            tooltip={
                isPinned
                    ? `Pinned: ${pinnedPanelTitle}. Click to unpin.`
                    : 'Pin a panel from its menu to keep it visible while scrolling.'
            }
            aria-label="Pinned panel"
            onClick={isPinned ? onUnpin : undefined}
            variant={isPinned ? 'active' : 'default'}
            disabled={!isPinned}
        >
            {isPinned ? 'Pinned' : 'Pin'}
        </ToolbarButton>
    );
}
