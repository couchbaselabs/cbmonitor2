import React, { useState, useEffect } from 'react';
import { SceneObjectBase, SceneComponentProps, SceneObjectState } from '@grafana/scenes';
import { RadioButtonGroup } from '@grafana/ui';
import { layoutService, LayoutMode } from '../../services/layoutService';

interface LayoutToggleState extends SceneObjectState {
    onLayoutChange: () => void;
}

export class LayoutToggle extends SceneObjectBase<LayoutToggleState> {
    static Component = LayoutToggleRenderer;

    constructor(state: LayoutToggleState) {
        super(state);
    }
}

function LayoutToggleRenderer({ model }: SceneComponentProps<LayoutToggle>) {
    const { onLayoutChange } = model.useState();
    const [layout, setLayout] = useState<LayoutMode>(layoutService.getLayout());

    useEffect(() => {
        // Subscribe to layout changes
        const unsubscribe = layoutService.subscribe((newLayout) => {
            setLayout(newLayout);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    const handleChange = (value: LayoutMode) => {
        layoutService.setLayout(value);
        // Trigger callback to reload dashboards
        if (onLayoutChange) {
            onLayoutChange();
        }
    };

    const options = [
        { label: 'Grid', value: 'grid' as LayoutMode, icon: 'apps' },
        { label: 'Rows', value: 'rows' as LayoutMode, icon: 'list-ul' },
    ];

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RadioButtonGroup
                options={options}
                value={layout}
                onChange={handleChange}
                size="sm"
            />
        </div>
    );
}
