import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { SceneObjectBase, SceneObjectState, SceneComponentProps } from '@grafana/scenes';
import { Alert, Field, RadioButtonGroup, Switch, Stack, useStyles2 } from '@grafana/ui';
import {
    getKioskPref,
    setKioskPref,
    getThemePref,
    setThemePref,
    type ThemePref,
} from '../../userPrefs';

export class PreferencesScene extends SceneObjectBase<SceneObjectState> {
    public static Component = PreferencesRenderer;
}

const themeOptions: Array<{ label: string; value: ThemePref; description?: string }> = [
    { label: 'System', value: 'system', description: 'Follow your OS light/dark setting' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
];

function PreferencesRenderer(_props: SceneComponentProps<PreferencesScene>) {
    const styles = useStyles2(getStyles);
    const [kiosk, setKiosk] = useState<boolean>(getKioskPref());
    const [theme, setTheme] = useState<ThemePref>(getThemePref());

    const onToggleKiosk = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.currentTarget.checked;
        setKiosk(next);
        setKioskPref(next);
    };

    const onChangeTheme = (next: ThemePref) => {
        setTheme(next);
        setThemePref(next);
        // Reload so Grafana picks up the new ?theme= URL param immediately.
        // The userPrefs preload hook runs before React mounts, so a full
        // reload is the simplest way to apply the theme everywhere.
        window.location.reload();
    };

    return (
        <div className={styles.container}>
            <Stack direction="column" gap={2}>
                <h2 className={styles.heading}>User Preferences</h2>

                <Alert severity="info" title="Browser-only preferences">
                    These settings are stored in this browser only. They apply to anyone using
                    this browser (including anonymous sessions) and do not sync across devices.
                </Alert>

                <Field
                    label="Kiosk mode by default"
                    description="Hide Grafana navigation by default when using the app. You can still toggle kiosk per-page with the keyboard shortcut 'd k' or by clicking `Esc`."
                >
                    <Switch value={kiosk} onChange={onToggleKiosk} />
                </Field>

                <Field
                    label="Theme"
                    description="Override the Grafana theme for this browser. System follows your OS light/dark preference. More theme selection is available in Grafana settings for logged in users."
                >
                    <RadioButtonGroup<ThemePref>
                        options={themeOptions}
                        value={theme}
                        onChange={onChangeTheme}
                    />
                </Field>
            </Stack>
        </div>
    );
}

const getStyles = (theme: GrafanaTheme2) => ({
    container: css`
        max-width: 720px;
        padding: ${theme.spacing(3)};
    `,
    heading: css`
        margin: 0 0 ${theme.spacing(1)} 0;
        color: ${theme.colors.text.primary};
    `,
});
