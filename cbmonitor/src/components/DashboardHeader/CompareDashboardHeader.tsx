import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { SettingsDropdown } from '../SettingsDropdown/SettingsDropdown';
import { CompareSnapshotItem, CompareTitleList } from './CompareTitleList';
import { CommonPhasePills } from './CommonPhasePills';
import { HeaderActionRow, HeaderAction } from './HeaderActionRow';

export interface CompareDashboardHeaderProps {
    items: CompareSnapshotItem[];
    commonPhases: string[];
    onSelectCommonPhase: (label: string) => void;
    onSelectFullRange: () => void;
    overlapEnabled: boolean;
    settingsDropdown?: SettingsDropdown;
    actions?: HeaderAction[];
}

export function CompareDashboardHeader(props: CompareDashboardHeaderProps) {
    const {
        items,
        commonPhases,
        onSelectCommonPhase,
        onSelectFullRange,
        overlapEnabled,
        settingsDropdown,
        actions = [],
    } = props;

    const styles = useStyles2(getStyles);

    return (
        <div className={styles.root}>
            <div className={styles.titleRow}>
                <CompareTitleList items={items} />
                <HeaderActionRow actions={actions} settingsDropdown={settingsDropdown} />
            </div>
            <CommonPhasePills
                commonPhases={commonPhases}
                onSelectCommonPhase={onSelectCommonPhase}
                onSelectFullRange={onSelectFullRange}
                disabled={overlapEnabled}
                disabledTooltip="Phase selection is disabled while overlap mode is active"
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
