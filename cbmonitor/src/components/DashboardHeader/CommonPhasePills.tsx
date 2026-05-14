import React, { useEffect, useState } from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

interface CommonPhasePillsProps {
    commonPhases: string[];
    onSelectCommonPhase: (label: string) => void;
    onSelectFullRange: () => void;
    disabled?: boolean;
    disabledTooltip?: string;
}

const normalize = (label: string) => label.trim().toLowerCase();

export function CommonPhasePills({
    commonPhases,
    onSelectCommonPhase,
    onSelectFullRange,
    disabled = false,
    disabledTooltip,
}: CommonPhasePillsProps) {
    const styles = useStyles2(getStyles);
    const [active, setActive] = useState<string | null>(null);

    useEffect(() => {
        if (disabled) {
            setActive(null);
        }
    }, [disabled]);

    const noneActive = active === null;

    return (
        <div className={styles.root}>
            <span className={styles.label}>Common phases:</span>
            <div className={styles.pills} role="group" aria-label="Common phase selection">
                <button
                    type="button"
                    className={cx(styles.pill, noneActive && styles.pillActive, disabled && styles.pillDisabled)}
                    title={disabled ? disabledTooltip : 'Show the full snapshot range for all snapshots'}
                    disabled={disabled}
                    onClick={() => {
                        if (disabled) {
                            return;
                        }
                        if (!noneActive) {
                            setActive(null);
                            onSelectFullRange();
                        }
                    }}
                    aria-pressed={noneActive}
                >
                    Full range
                </button>
                {commonPhases.length === 0 ? (
                    <span className={styles.empty}>No common phases</span>
                ) : (
                    commonPhases.map((label) => {
                        const normalized = normalize(label);
                        const isActive = active === normalized;
                        return (
                            <button
                                key={label}
                                type="button"
                                className={cx(styles.pill, isActive && styles.pillActive, disabled && styles.pillDisabled)}
                                disabled={disabled}
                                title={disabled ? disabledTooltip : `Sync all snapshots to phase "${label}"`}
                                onClick={() => {
                                    if (disabled) {
                                        return;
                                    }
                                    setActive((prev) => {
                                        if (prev === normalized) {
                                            onSelectFullRange();
                                            return null;
                                        }
                                        onSelectCommonPhase(normalized);
                                        return normalized;
                                    });
                                }}
                                aria-pressed={isActive}
                            >
                                {label}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}

const getStyles = (theme: GrafanaTheme2) => ({
    root: css`
        display: flex;
        align-items: center;
        gap: ${theme.spacing(1)};
        flex-wrap: wrap;
    `,
    label: css`
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.secondary};
        font-weight: ${theme.typography.fontWeightMedium};
    `,
    pills: css`
        display: flex;
        flex-wrap: wrap;
        gap: ${theme.spacing(0.5)};
    `,
    pill: css`
        font-size: ${theme.typography.bodySmall.fontSize};
        padding: ${theme.spacing(0.25, 1)};
        border-radius: ${theme.shape.radius.pill};
        background: ${theme.colors.background.secondary};
        border: 1px solid ${theme.colors.border.medium};
        color: ${theme.colors.text.primary};
        cursor: pointer;
        line-height: 1.4;
        transition: background 0.15s ease, border-color 0.15s ease;
        &:hover {
            background: ${theme.colors.action.hover};
            border-color: ${theme.colors.border.strong};
        }
        &:focus-visible {
            outline: 2px solid ${theme.colors.primary.border};
            outline-offset: 1px;
        }
    `,
    pillActive: css`
        background: ${theme.colors.primary.main};
        border-color: ${theme.colors.primary.border};
        color: ${theme.colors.primary.contrastText};
        &:hover {
            background: ${theme.colors.primary.shade};
            border-color: ${theme.colors.primary.border};
        }
    `,
    pillDisabled: css`
        cursor: not-allowed;
        opacity: 0.6;
        &:hover {
            background: ${theme.colors.background.secondary};
            border-color: ${theme.colors.border.medium};
        }
    `,
    empty: css`
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.secondary};
        font-style: italic;
        align-self: center;
    `,
});
