import React, { useEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { dateTime, GrafanaTheme2 } from '@grafana/data';
import { Drawer, Icon, IconButton, useStyles2 } from '@grafana/ui';
import { SnapshotMetadata } from 'types/snapshot';

interface SnapshotDetailsDrawerProps {
    metadata: SnapshotMetadata;
    onClose: () => void;
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

function formatTs(ts?: string): string {
    if (!ts) {
        return '—';
    }
    if (ts.startsWith('now')) {
        return ts;
    }
    const d = dateTime(ts);
    return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : ts;
}

export function SnapshotDetailsDrawer({ metadata, onClose }: SnapshotDetailsDrawerProps) {
    const styles = useStyles2(getStyles);
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(metadata.snapshotId);
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            setCopied(true);
            timeoutRef.current = setTimeout(() => setCopied(false), 1200);
        } catch {
            // ignore
        }
    };

    const label = metadata.label;
    const labelIsUrl = isValidURL(label);

    return (
        <Drawer title="Snapshot details" onClose={onClose} size="md">
            <div className={styles.body}>
                <Section label="ID">
                    <div className={styles.idRow}>
                        <span className={styles.idText}>{metadata.snapshotId}</span>
                        <IconButton
                            name={copied ? 'check' : 'copy'}
                            tooltip={copied ? 'Copied' : 'Copy ID'}
                            aria-label="Copy snapshot ID"
                            onClick={onCopy}
                            size="md"
                        />
                    </div>
                </Section>

                <Section label="Server version">
                    <span>{metadata.version}</span>
                </Section>

                {label && (
                    <Section label="Label">
                        {labelIsUrl ? (
                            <a
                                className={styles.link}
                                href={label}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {label}
                            </a>
                        ) : (
                            <span className={styles.wrap}>{label}</span>
                        )}
                    </Section>
                )}

                <Section label="Time range">
                    <div className={styles.kv}>
                        <span className={styles.kvKey}>Start:</span>
                        <span className={styles.kvVal}>{formatTs(metadata.ts_start)}</span>
                    </div>
                    <div className={styles.kv}>
                        <span className={styles.kvKey}>End:</span>
                        <span className={styles.kvVal}>{formatTs(metadata.ts_end)}</span>
                    </div>
                </Section>

                {metadata.services && metadata.services.length > 0 && (
                    <Section label="Services">
                        <div className={styles.tags}>
                            {metadata.services.map((s) => (
                                <span key={s} className={styles.tag}>{s}</span>
                            ))}
                        </div>
                    </Section>
                )}

                {metadata.phases && metadata.phases.length > 0 && (
                    <Section label={`Phases (${metadata.phases.length})`}>
                        <div className={styles.phaseList}>
                            {metadata.phases.map((p) => (
                                <div key={p.label} className={styles.phaseRow}>
                                    <span className={styles.phaseLabel}>{p.label}</span>
                                    <span className={styles.phaseTimes}>
                                        {formatTs(p.ts_start)} → {formatTs(p.ts_end)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {metadata.clusters && metadata.clusters.length > 0 && (
                    <Section label={`Clusters (${metadata.clusters.length})`}>
                        <div className={styles.phaseList}>
                            {metadata.clusters.map((c, i) => (
                                <div key={c.uid} className={styles.phaseRow}>
                                    <span className={styles.phaseLabel}>
                                        {c.name || `Cluster ${i + 1}`}
                                    </span>
                                    <span className={styles.uid} title={c.uid}>
                                        <Icon name="info-circle" size="xs" /> {c.uid}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}
            </div>
        </Drawer>
    );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    const styles = useStyles2(getStyles);
    return (
        <div className={styles.section}>
            <div className={styles.sectionLabel}>{label}</div>
            <div className={styles.sectionContent}>{children}</div>
        </div>
    );
}

const getStyles = (theme: GrafanaTheme2) => ({
    body: css`
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing(2)};
    `,
    section: css`
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing(0.5)};
        padding-bottom: ${theme.spacing(1)};
        border-bottom: 1px solid ${theme.colors.border.weak};
        &:last-child {
            border-bottom: none;
        }
    `,
    sectionLabel: css`
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.secondary};
        text-transform: uppercase;
        letter-spacing: 0.5px;
    `,
    sectionContent: css`
        font-size: ${theme.typography.body.fontSize};
        color: ${theme.colors.text.primary};
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing(0.5)};
    `,
    idRow: css`
        display: flex;
        align-items: center;
        gap: ${theme.spacing(1)};
    `,
    idText: css`
        font-family: ${theme.typography.fontFamilyMonospace};
        word-break: break-all;
    `,
    link: css`
        color: ${theme.colors.text.link};
        text-decoration: none;
        word-break: break-word;
        &:hover {
            text-decoration: underline;
        }
    `,
    wrap: css`
        word-break: break-word;
    `,
    kv: css`
        display: flex;
        gap: ${theme.spacing(1)};
        align-items: baseline;
    `,
    kvKey: css`
        color: ${theme.colors.text.secondary};
        min-width: 50px;
    `,
    kvVal: css`
        font-family: ${theme.typography.fontFamilyMonospace};
        font-size: ${theme.typography.bodySmall.fontSize};
    `,
    tags: css`
        display: flex;
        flex-wrap: wrap;
        gap: ${theme.spacing(0.5)};
    `,
    tag: css`
        background: ${theme.colors.background.secondary};
        border: 1px solid ${theme.colors.border.weak};
        color: ${theme.colors.text.primary};
        padding: ${theme.spacing(0.25, 1)};
        border-radius: ${theme.shape.radius.default};
        font-size: ${theme.typography.bodySmall.fontSize};
    `,
    phaseList: css`
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing(0.5)};
    `,
    phaseRow: css`
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: ${theme.spacing(1)};
        padding: ${theme.spacing(0.5, 1)};
        background: ${theme.colors.background.secondary};
        border-radius: ${theme.shape.radius.default};
    `,
    phaseLabel: css`
        font-weight: ${theme.typography.fontWeightMedium};
    `,
    phaseTimes: css`
        font-family: ${theme.typography.fontFamilyMonospace};
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.secondary};
    `,
    uid: css`
        font-family: ${theme.typography.fontFamilyMonospace};
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.secondary};
        display: inline-flex;
        align-items: center;
        gap: ${theme.spacing(0.5)};
    `,
});
