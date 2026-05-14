import React from 'react';
import { ToolbarButton } from '@grafana/ui';

interface ExploreButtonProps {
    onClick?: () => void;
    disabled?: boolean;
}

export function ExploreButton({ onClick, disabled = true }: ExploreButtonProps) {
    return (
        <ToolbarButton
            icon="compass"
            tooltip={disabled ? 'Open in Explore (coming soon)' : 'Open active panel in Grafana Explore'}
            aria-label="Open in Explore"
            onClick={onClick}
            disabled={disabled}
        >
            Explore
        </ToolbarButton>
    );
}
