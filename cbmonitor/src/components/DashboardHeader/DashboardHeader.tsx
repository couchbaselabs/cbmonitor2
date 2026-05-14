import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { SnapshotMetadata } from 'types/snapshot';
import { ClusterToggle } from '../ClusterSelector/ClusterToggle';
import { SettingsDropdown } from '../SettingsDropdown/SettingsDropdown';
import { HeaderTitle } from './HeaderTitle';
import { HeaderContextRow } from './HeaderContextRow';
import { HeaderActionRow, HeaderAction } from './HeaderActionRow';

export interface DashboardHeaderProps {
    metadata: SnapshotMetadata;
    initialActivePhase?: string | null;
    onSelectPhase: (phaseLabel: string) => void;
    onSelectFullRange: () => void;
    clusterToggle: ClusterToggle;
    settingsDropdown?: SettingsDropdown;
    actions?: HeaderAction[];
}

export function DashboardHeader(props: DashboardHeaderProps) {
    const {
        metadata,
        initialActivePhase,
        onSelectPhase,
        onSelectFullRange,
        clusterToggle,
        settingsDropdown,
        actions = [],
    } = props;

    const styles = useStyles2(getStyles);

    return (
        <div className={styles.root}>
            <div className={styles.titleRow}>
                <HeaderTitle metadata={metadata} />
                <HeaderActionRow
                    actions={actions}
                    settingsDropdown={settingsDropdown}
                />
            </div>
            <HeaderContextRow
                metadata={metadata}
                initialActivePhase={initialActivePhase}
                onSelectPhase={onSelectPhase}
                onSelectFullRange={onSelectFullRange}
                clusterToggle={clusterToggle}
            />
        </div>
    );
}

const getStyles = (theme: GrafanaTheme2) => ({
    root: css`
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing(1)};
        width: 100%;
        padding: ${theme.spacing(1, 0)};
    `,
    titleRow: css`
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: ${theme.spacing(2)};
        flex-wrap: wrap;
    `,
});
