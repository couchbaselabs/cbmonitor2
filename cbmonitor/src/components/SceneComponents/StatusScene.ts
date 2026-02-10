import React from 'react';
import { SceneObjectBase, SceneObjectState, SceneComponentProps } from '@grafana/scenes';
import { Alert } from '@grafana/ui';

/**
 * State for StatusScene component
 */
export interface StatusSceneState extends SceneObjectState {
    message: string;
    status: 'success' | 'error' | 'info' | 'warning';
    title?: string;
}

/**
 * A reusable scene component for displaying status messages (loading, success, error, info).
 *
 * @example
 * // Show loading message
 * new StatusScene({ message: 'Loading data...', status: 'info' })
 *
 * @example
 * // Show success message
 * new StatusScene({ message: 'All data loaded!', status: 'success' })
 *
 * @example
 * // Show error with custom title
 * new StatusScene({ message: 'Failed to connect', status: 'error', title: 'Connection Error' })
 */
export class StatusScene extends SceneObjectBase<StatusSceneState> {
    public static Component = StatusSceneRenderer;

    public constructor(options: StatusSceneState) {
        const title = options.title ||
            (options.status === 'success' ? 'Success' :
                options.status === 'error' ? 'Error' :
                    options.status === 'warning' ? 'Warning' : 'Info');

        super({
            ...options,
            title,
        });
    }

    /**
     * Update the status message
     */
    public updateMessage(message: string, status?: 'success' | 'error' | 'info' | 'warning'): void {
        this.setState({
            message,
            ...(status && { status })
        });
    }
}

/**
 * Renderer component for StatusScene
 */
function StatusSceneRenderer({ model }: SceneComponentProps<StatusScene>) {
    const { message, status, title } = model.useState();

    return React.createElement(
        Alert as any,
        { title, severity: status },
        React.createElement('pre', {
            style: {
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                margin: 0
            }
        }, message)
    );
}
