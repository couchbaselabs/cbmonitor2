import React from 'react';
import { SceneObjectBase, SceneObjectState, SceneComponentProps } from '@grafana/scenes';

/**
 * State for PlaceholderScene component
 */
export interface PlaceholderSceneState extends SceneObjectState {
    text: string;
    style?: React.CSSProperties;
}

/**
 * A simple placeholder scene component for empty states or coming-soon features.
 *
 * @example
 * // Basic placeholder
 * new PlaceholderScene({ text: 'No data available' })
 *
 * @example
 * // Placeholder with custom styling
 * new PlaceholderScene({
 *   text: 'Coming soon',
 *   style: { fontSize: 18, color: '#555' }
 * })
 */
export class PlaceholderScene extends SceneObjectBase<PlaceholderSceneState> {
    public static Component = PlaceholderRenderer;

    public constructor(options: PlaceholderSceneState) {
        super({
            text: options.text || 'Placeholder',
            style: options.style,
        });
    }

    /**
     * Update the placeholder text
     */
    public updateText(text: string): void {
        this.setState({ text });
    }
}

/**
 * Renderer component for PlaceholderScene
 */
function PlaceholderRenderer({ model }: SceneComponentProps<PlaceholderScene>) {
    const { text, style } = model.useState();

    const defaultStyle: React.CSSProperties = {
        height: '100vh',
        minHeight: '600px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9CA3AF',
        fontSize: 14,
    };

    return React.createElement('div', {
        style: { ...defaultStyle, ...style }
    }, text);
}
