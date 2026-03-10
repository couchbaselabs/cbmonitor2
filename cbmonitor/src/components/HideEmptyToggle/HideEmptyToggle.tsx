import React, { useState, useEffect } from 'react';
import { SceneObjectBase, SceneComponentProps, SceneObjectState } from '@grafana/scenes';
import { Switch, InlineField, Tooltip } from '@grafana/ui';
import { layoutService } from '../../services/layoutService';

interface HideEmptyToggleState extends SceneObjectState {
    onToggle?: () => void;
}

export class HideEmptyToggle extends SceneObjectBase<HideEmptyToggleState> {
    static Component = HideEmptyToggleRenderer;

    constructor(state?: HideEmptyToggleState) {
        super(state || {});
    }
}

function HideEmptyToggleRenderer({ model }: SceneComponentProps<HideEmptyToggle>) {
    const { onToggle } = model.useState();
    const [hideEmpty, setHideEmpty] = useState(layoutService.getHideEmptyPanels());

    useEffect(() => {
        const unsubscribe = layoutService.subscribeHideEmpty((hide) => {
            setHideEmpty(hide);
        });
        return unsubscribe;
    }, []);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.checked;
        layoutService.setHideEmptyPanels(newValue);
        if (onToggle) {
            onToggle();
        }
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <Tooltip content="Hide panels that have no data for the selected time range or cluster">
                <InlineField label="Hide empty" transparent>
                    <Switch
                        value={hideEmpty}
                        onChange={handleChange}
                    />
                </InlineField>
            </Tooltip>
        </div>
    );
}
