import React from 'react';
import { SceneObjectBase, SceneComponentProps, SceneObjectState, SceneObject } from '@grafana/scenes';

interface ControlsBarState extends SceneObjectState {
    controls: SceneObject[];
}

export class ControlsBar extends SceneObjectBase<ControlsBarState> {
    static Component = ControlsBarRenderer;

    constructor(state: ControlsBarState) {
        super(state);
    }
}

function ControlsBarRenderer({ model }: SceneComponentProps<ControlsBar>) {
    const { controls } = model.useState();

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
            padding: '8px 0',
        }}>
            {controls.map((control, index) => {
                const Component = (control as any).constructor.Component;
                return Component ? (
                    <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
                        <Component model={control} />
                    </div>
                ) : null;
            })}
        </div>
    );
}
