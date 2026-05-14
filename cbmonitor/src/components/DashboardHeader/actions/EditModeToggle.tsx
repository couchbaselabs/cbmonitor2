import React from 'react';
import { ToolbarButton } from '@grafana/ui';

interface EditModeToggleProps {
    active?: boolean;
    onToggle?: (next: boolean) => void;
    disabled?: boolean;
}

export function EditModeToggle({ active = false, onToggle, disabled = true }: EditModeToggleProps) {
    return (
        <ToolbarButton
            icon="edit"
            tooltip={
                disabled
                    ? 'Local edit mode (coming soon)'
                    : active
                        ? 'Exit edit mode'
                        : 'Enter edit mode to modify panels locally'
            }
            aria-label="Toggle edit mode"
            onClick={() => onToggle?.(!active)}
            variant={active ? 'active' : 'default'}
            disabled={disabled}
        >
            Edit
        </ToolbarButton>
    );
}
