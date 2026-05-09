import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { SceneObjectBase, SceneObjectState, SceneComponentProps } from '@grafana/scenes';
import { Alert, Field, Switch, Stack, useStyles2 } from '@grafana/ui';
import { getKioskPref, setKioskPref } from '../../kiosk';

export class PreferencesScene extends SceneObjectBase<SceneObjectState> {
    public static Component = PreferencesRenderer;
}

function PreferencesRenderer(_props: SceneComponentProps<PreferencesScene>) {
    const styles = useStyles2(getStyles);
    const [kiosk, setKiosk] = useState<boolean>(getKioskPref());

    const onToggleKiosk = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.currentTarget.checked;
        setKiosk(next);
        setKioskPref(next);
    };

    return (
        <div className={styles.container}>
            <Stack direction="column" gap={2}>
                <h2 className={styles.heading}>Preferences</h2>

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
