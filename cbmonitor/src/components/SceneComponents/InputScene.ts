import React from 'react';
import { SceneObjectBase, SceneObjectState, SceneComponentProps } from '@grafana/scenes';
import { Alert, Button, Input, useStyles2, Icon } from '@grafana/ui';
import { locationService } from '@grafana/runtime';
import { prefixRoute, ROUTE_PATHS } from '../../utils/utils.routing';

/**
 * State for InputScene component
 */
export interface InputSceneState extends SceneObjectState {
    mode: 'single' | 'multiple';
    minInputs?: number;
    maxInputs?: number;
    placeholder?: string;
    submitLabel?: string;
    errorMessage?: string;
    onSubmit?: (values: string[]) => void;
    // Branding options for a polished landing page
    title?: string;           // Large heading
    subtitle?: string;        // Descriptive text below title
    iconName?: string;        // Icon name to show next to title (e.g., "swap-horiz")
    iconSize?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl';  // Icon size
}

/**
 * A reusable scene component for input forms.
 * Supports single or multiple inputs with validation.
 *
 * @example
 * // Single input
 * new InputScene({
 *   mode: 'single',
 *   placeholder: 'Enter snapshot ID',
 *   onSubmit: (values) => console.log(values[0])
 * })
 *
 * @example
 * // Multiple inputs (comparison mode)
 * new InputScene({
 *   mode: 'multiple',
 *   minInputs: 2,
 *   maxInputs: 6,
 *   placeholder: 'Snapshot ID',
 *   submitLabel: 'Compare',
 *   onSubmit: (values) => navigateToComparison(values)
 * })
 */
export class InputScene extends SceneObjectBase<InputSceneState> {
    public static Component = InputSceneRenderer;

    public constructor(options: InputSceneState) {
        super({
            mode: options.mode || 'single',
            minInputs: options.minInputs || (options.mode === 'multiple' ? 2 : 1),
            maxInputs: options.maxInputs || (options.mode === 'multiple' ? 6 : 1),
            placeholder: options.placeholder || 'Enter value',
            submitLabel: options.submitLabel || 'Submit',
            errorMessage: options.errorMessage,
            onSubmit: options.onSubmit,
            title: options.title,
            subtitle: options.subtitle,
            iconName: options.iconName,
            iconSize: options.iconSize || 'xxxl',
        });
    }

    /**
     * Update the error message
     */
    public setError(message?: string): void {
        this.setState({ errorMessage: message });
    }
}

/**
 * Renderer component for InputScene
 */
function InputSceneRenderer({ model }: SceneComponentProps<InputScene>) {
    const { mode, minInputs, maxInputs, placeholder, submitLabel, errorMessage, onSubmit, title, subtitle, iconName, iconSize } = model.useState();

    const s = useStyles2((theme) => ({
        container: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: title ? '60vh' : 'auto',
            gap: 16,
            padding: 24,
        } as React.CSSProperties,
        content: {
            textAlign: 'center',
            maxWidth: 800,
            width: '100%',
        } as React.CSSProperties,
        logoContainer: {
            marginBottom: 24,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
        } as React.CSSProperties,
        icon: {
            color: theme.colors.primary.main,
        } as React.CSSProperties,
        title: {
            fontSize: 48,
            fontWeight: 600,
            color: theme.colors.text.primary,
            margin: 0,
            letterSpacing: '-0.5px',
        } as React.CSSProperties,
        subtitle: {
            fontSize: 18,
            color: theme.colors.text.secondary,
            margin: '0 0 32px 0',
            lineHeight: 1.5,
        } as React.CSSProperties,
        header: {
            display: 'flex',
            alignItems: 'center',
            gap: 8
        } as React.CSSProperties,
        form: {
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            alignItems: 'stretch',
            width: '100%',
            maxWidth: 720
        } as React.CSSProperties,
        inputsList: {
            display: 'flex',
            flexDirection: 'column',
            gap: 8
        } as React.CSSProperties,
        row: {
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap'
        } as React.CSSProperties,
        input: {
            flex: 1,
            minWidth: 280
        } as React.CSSProperties,
        actions: {
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            justifyContent: title ? 'center' : 'flex-start'
        } as React.CSSProperties,
        info: {
            fontSize: 12,
            color: '#9CA3AF'
        } as React.CSSProperties,
    }));

    const initialCount = mode === 'multiple' ? (minInputs || 2) : 1;
    const [ids, setIds] = React.useState<string[]>(Array(initialCount).fill(''));
    const [localError, setLocalError] = React.useState<string | undefined>(undefined);

    const handleSubmit = () => {
        const parts = ids.map((p) => p.trim()).filter((p) => p.length > 0);

        if (parts.length < (minInputs || 1)) {
            setLocalError(`Please enter at least ${minInputs} value${(minInputs || 1) > 1 ? 's' : ''}.`);
            return;
        }

        if (parts.length > (maxInputs || 1)) {
            setLocalError(`Please enter no more than ${maxInputs} values.`);
            return;
        }

        setLocalError(undefined);

        if (onSubmit) {
            onSubmit(parts);
        } else if (mode === 'multiple') {
            // Default behavior for comparison
            locationService.push(prefixRoute(ROUTE_PATHS.compareSnapshots(parts)));
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    };

    const updateId = (idx: number, value: string) => {
        setIds((prev) => prev.map((v, i) => (i === idx ? value : v)));
    };

    const addInput = () => {
        if (ids.length >= (maxInputs || 1)) { return; }
        setLocalError(undefined);
        setIds((prev) => [...prev, '']);
    };

    const removeInput = (idx: number) => {
        if (ids.length <= (minInputs || 1)) { return; }
        setLocalError(undefined);
        setIds((prev) => prev.filter((_, i) => i !== idx));
    };

    return React.createElement('div', { style: s.container },
        React.createElement('div', { style: s.content },
            // Branded header (icon + title + subtitle) when title is provided
            title && React.createElement('div', { style: s.logoContainer },
                iconName && React.createElement(Icon as any, {
                    name: iconName,
                    size: iconSize || 'xxxl',
                    style: s.icon
                }),
                React.createElement('h1', { style: s.title }, title)
            ),
            title && subtitle && React.createElement('p', { style: s.subtitle }, subtitle),
            // Small icon when no title (backward compatible)
            !title && React.createElement('div', { style: s.header },
                React.createElement(Icon as any, {
                    name: mode === 'multiple' ? 'swap-horiz' : 'search',
                    size: 'xl'
                }),
            ),
            errorMessage && React.createElement(Alert as any, {
                severity: 'info',
                title: 'Info'
            }, errorMessage),
            localError && React.createElement(Alert as any, {
                severity: 'error',
                title: 'Validation'
            }, localError),
            React.createElement('div', { style: s.form },
                React.createElement('div', { style: s.inputsList },
                    ...ids.map((val, idx) =>
                        React.createElement('div', { key: idx, style: s.row },
                            React.createElement(Input as any, {
                                value: val,
                                placeholder: `${placeholder}${mode === 'multiple' ? ` #${idx + 1}` : ''}`,
                                onChange: (e: any) => updateId(idx, e.currentTarget.value),
                                onKeyDown,
                                style: s.input,
                                prefix: React.createElement(Icon as any, { name: 'search' }),
                                autoFocus: idx === 0,
                            }),
                            mode === 'multiple' && idx >= (minInputs || 2) &&
                            React.createElement(Button as any, {
                                onClick: () => removeInput(idx),
                                size: 'sm',
                                variant: 'secondary'
                            }, '−')
                        )
                    )
                ),
                React.createElement('div', { style: s.actions },
                    mode === 'multiple' && React.createElement(Button as any, {
                        onClick: addInput,
                        size: 'sm',
                        disabled: ids.length >= (maxInputs || 6),
                        variant: 'secondary'
                    }, '+'),
                    React.createElement(Button as any, {
                        onClick: handleSubmit,
                        size: 'md',
                        variant: 'primary'
                    }, submitLabel),
                    React.createElement(Button as any, {
                        onClick: () => locationService.push(prefixRoute(ROUTE_PATHS.search())),
                        size: 'md',
                        variant: 'secondary'
                    }, 'Back to Search')
                )
            ),
            mode === 'multiple' && React.createElement('div', { style: s.info },
                `Tip: at least ${minInputs} value${(minInputs || 1) > 1 ? 's' : ''}; max ${maxInputs}.`
            )
        )
    );
}
