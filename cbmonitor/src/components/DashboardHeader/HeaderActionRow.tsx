import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { ToolbarButtonRow, useStyles2 } from '@grafana/ui';
import { SettingsDropdown } from '../SettingsDropdown/SettingsDropdown';

export interface HeaderAction {
    key: string;
    render: () => React.ReactNode;
}

interface HeaderActionRowProps {
    actions?: HeaderAction[];
    settingsDropdown?: SettingsDropdown;
}

export function HeaderActionRow({ actions = [], settingsDropdown }: HeaderActionRowProps) {
    const styles = useStyles2(getStyles);
    const SettingsComponent = settingsDropdown
        ? (settingsDropdown as unknown as { Component: React.ComponentType<{ model: SettingsDropdown }> }).Component
        : null;

    return (
        <div className={styles.root}>
            <ToolbarButtonRow alignment="right">
                {actions.map((a) => (
                    <React.Fragment key={a.key}>{a.render()}</React.Fragment>
                ))}
                {SettingsComponent && settingsDropdown && (
                    <SettingsComponent model={settingsDropdown} />
                )}
            </ToolbarButtonRow>
        </div>
    );
}

const getStyles = (_theme: GrafanaTheme2) => ({
    root: css`
        display: flex;
        align-items: center;
        flex-shrink: 0;
    `,
});
