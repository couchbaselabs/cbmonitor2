import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { IconButton, useStyles2 } from '@grafana/ui';
import { SnapshotMetadata } from 'types/snapshot';
import { SnapshotDetailsDrawer } from './SnapshotDetailsDrawer';

interface HeaderTitleProps {
    metadata: SnapshotMetadata;
}

function isValidURL(str?: string): boolean {
    if (!str) {
        return false;
    }
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

export function HeaderTitle({ metadata }: HeaderTitleProps) {
    const styles = useStyles2(getStyles);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const labelText = metadata.label;
    const labelIsUrl = isValidURL(labelText);

    return (
        <>
            <div className={styles.root}>
                <span className={styles.id} title={metadata.snapshotId}>
                    {metadata.snapshotId}
                </span>
                <span className={styles.sep}>·</span>
                <span className={styles.version}>{metadata.version}</span>
                {labelText && (
                    <>
                        <span className={styles.sep}>·</span>
                        {labelIsUrl ? (
                            <a
                                className={styles.labelLink}
                                href={labelText}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={labelText}
                            >
                                {labelText}
                            </a>
                        ) : (
                            <span className={styles.label} title={labelText}>
                                {labelText}
                            </span>
                        )}
                    </>
                )}
                <IconButton
                    name="info-circle"
                    tooltip="Show snapshot details"
                    aria-label="Show snapshot details"
                    onClick={() => setDrawerOpen(true)}
                    size="md"
                />
            </div>
            {drawerOpen && (
                <SnapshotDetailsDrawer
                    metadata={metadata}
                    onClose={() => setDrawerOpen(false)}
                />
            )}
        </>
    );
}

const getStyles = (theme: GrafanaTheme2) => ({
    root: css`
        display: flex;
        align-items: center;
        gap: ${theme.spacing(1)};
        min-width: 0;
        flex: 1 1 auto;
        color: ${theme.colors.text.primary};
        font-size: ${theme.typography.h5.fontSize};
        font-weight: ${theme.typography.fontWeightMedium};
    `,
    id: css`
        font-family: ${theme.typography.fontFamilyMonospace};
        font-size: ${theme.typography.body.fontSize};
        font-weight: ${theme.typography.fontWeightMedium};
        color: ${theme.colors.text.primary};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 280px;
    `,
    version: css`
        font-size: ${theme.typography.body.fontSize};
        color: ${theme.colors.text.secondary};
        font-weight: ${theme.typography.fontWeightRegular};
    `,
    sep: css`
        color: ${theme.colors.text.disabled};
    `,
    label: css`
        font-size: ${theme.typography.body.fontSize};
        color: ${theme.colors.text.secondary};
        max-width: 320px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `,
    labelLink: css`
        font-size: ${theme.typography.body.fontSize};
        color: ${theme.colors.text.link};
        text-decoration: none;
        max-width: 320px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        &:hover {
            text-decoration: underline;
        }
    `,
});
