import React, { useEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { IconButton, useStyles2 } from '@grafana/ui';
import { SnapshotMetadata } from 'types/snapshot';
import { SnapshotDetailsDrawer } from './SnapshotDetailsDrawer';
import { snapshotService } from '../../services/snapshotService';

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
    const [liveMetadata, setLiveMetadata] = useState<SnapshotMetadata>(metadata);
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setLiveMetadata(metadata);
    }, [metadata]);

    useEffect(() => {
        const unsubscribe = snapshotService.onSnapshotRefreshed((id) => {
            if (id !== liveMetadata.snapshotId) {
                return;
            }
            const fresh = snapshotService.getStoredSnapshotData(id);
            if (fresh?.metadata) {
                setLiveMetadata(fresh.metadata);
            }
        });
        return unsubscribe;
    }, [liveMetadata.snapshotId]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(liveMetadata.snapshotId);
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            setCopied(true);
            timeoutRef.current = setTimeout(() => setCopied(false), 1200);
        } catch {
            // ignore
        }
    };

    const labelText = liveMetadata.label;
    const labelIsUrl = isValidURL(labelText);

    return (
        <>
            <div className={styles.root}>
                <span className={styles.id} title={liveMetadata.snapshotId}>
                    {liveMetadata.snapshotId}
                </span>
                <IconButton
                    name={copied ? 'check' : 'copy'}
                    tooltip={copied ? 'Copied' : 'Copy ID'}
                    aria-label="Copy snapshot ID"
                    onClick={onCopy}
                    size="sm"
                />
                <span className={styles.sep}>·</span>
                <span className={styles.version}>{liveMetadata.version}</span>
                {labelText && (
                    <>
                        <span className={styles.sep}>·</span>
                        {labelIsUrl ? (
                            <a
                                className={`${styles.labelLink} ${styles.truncateStart}`}
                                href={labelText}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={labelText}
                            >
                                <bdi>{labelText}</bdi>
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
                    metadata={liveMetadata}
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
    // Truncate from the START of the string instead of the end. Useful for
    // URLs where the meaningful part (path, query) sits at the right edge.
    // The `direction: rtl` flips where the ellipsis lands; the inner <bdi>
    // (and the strong-LTR characters of an http URL) keep the visible text
    // reading left-to-right.
    truncateStart: css`
        direction: rtl;
        text-align: left;
    `,
});
