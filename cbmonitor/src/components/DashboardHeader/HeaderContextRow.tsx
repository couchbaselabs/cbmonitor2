import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { SnapshotMetadata } from 'types/snapshot';
import { ClusterToggle } from '../ClusterSelector/ClusterToggle';
import { PhasePills } from './PhasePills';

interface HeaderContextRowProps {
    metadata: SnapshotMetadata;
    initialActivePhase?: string | null;
    onSelectPhase: (phaseLabel: string) => void;
    onSelectFullRange: () => void;
    clusterToggle: ClusterToggle;
}

export function HeaderContextRow({
    metadata,
    initialActivePhase,
    onSelectPhase,
    onSelectFullRange,
    clusterToggle,
}: HeaderContextRowProps) {
    const styles = useStyles2(getStyles);
    const ClusterComponent = (clusterToggle as unknown as { Component: React.ComponentType<{ model: ClusterToggle }> }).Component;
    const hasClusters = (metadata.clusters?.length ?? 0) > 0;

    return (
        <div className={styles.root}>
            <PhasePills
                phases={metadata.phases}
                initialActivePhase={initialActivePhase}
                onSelectPhase={onSelectPhase}
                onSelectFullRange={onSelectFullRange}
            />
            {hasClusters && (
                <div className={styles.clusterGroup}>
                    <span className={styles.label}>Cluster:</span>
                    <ClusterComponent model={clusterToggle} />
                </div>
            )}
        </div>
    );
}

const getStyles = (theme: GrafanaTheme2) => ({
    root: css`
        display: flex;
        align-items: center;
        gap: ${theme.spacing(2)};
        flex-wrap: wrap;
    `,
    clusterGroup: css`
        display: flex;
        align-items: center;
        gap: ${theme.spacing(1)};
    `,
    label: css`
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.secondary};
        font-weight: ${theme.typography.fontWeightMedium};
    `,
});
