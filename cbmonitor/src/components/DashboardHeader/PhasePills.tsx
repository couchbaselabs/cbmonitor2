import React, { useEffect, useState } from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { Phase } from 'types/snapshot';

interface PhasePillsProps {
    phases?: Phase[];
    initialActivePhase?: string | null;
    onSelectPhase: (phaseLabel: string) => void;
    onSelectFullRange: () => void;
}

function formatPhaseTime(timestamp?: string): string {
    if (!timestamp || timestamp.startsWith('now')) {
        return timestamp ?? '';
    }
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function PhasePills({
    phases,
    initialActivePhase,
    onSelectPhase,
    onSelectFullRange,
}: PhasePillsProps) {
    const styles = useStyles2(getStyles);
    const [active, setActive] = useState<string | null>(initialActivePhase ?? null);

    useEffect(() => {
        setActive(initialActivePhase ?? null);
    }, [initialActivePhase]);

    if (!phases || phases.length === 0) {
        return <span className={styles.empty}>No phases</span>;
    }

    const noneActive = active === null;

    return (
        <div className={styles.root}>
            <span className={styles.label}>Phase:</span>
            <div className={styles.pills} role="group" aria-label="Phase selection">
                <button
                    type="button"
                    className={cx(styles.pill, noneActive && styles.pillActive)}
                    title="Show the full snapshot time range"
                    onClick={() => {
                        if (!noneActive) {
                            setActive(null);
                            onSelectFullRange();
                        }
                    }}
                    aria-pressed={noneActive}
                >
                    Full range
                </button>
                {phases.map((p) => {
                    const isActive = active === p.label;
                    return (
                        <button
                            key={p.label}
                            type="button"
                            className={cx(styles.pill, isActive && styles.pillActive)}
                            title={`${p.label}: ${formatPhaseTime(p.ts_start)} – ${formatPhaseTime(p.ts_end)}`}
                            onClick={() => {
                                setActive((prev) => {
                                    if (prev === p.label) {
                                        onSelectFullRange();
                                        return null;
                                    }
                                    onSelectPhase(p.label);
                                    return p.label;
                                });
                            }}
                            aria-pressed={isActive}
                        >
                            {p.label}
                        </button>
                    );
                })}
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
    empty: css`
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.secondary};
        font-style: italic;
    `,
});
