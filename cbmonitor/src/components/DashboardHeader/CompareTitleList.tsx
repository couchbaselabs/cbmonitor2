import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { IconButton, useStyles2 } from '@grafana/ui';
import { SnapshotMetadata } from 'types/snapshot';
import { SnapshotDetailsDrawer } from './SnapshotDetailsDrawer';

export interface CompareSnapshotItem {
    id: string;
    meta: SnapshotMetadata;
    title?: string;
}

interface CompareTitleListProps {
    items: CompareSnapshotItem[];
}

export function CompareTitleList({ items }: CompareTitleListProps) {
    const styles = useStyles2(getStyles);
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    return (
        <>
            <div className={styles.root}>
                {items.map((item, idx) => {
                    const letter = String.fromCharCode(65 + idx);
                    const title = item.title ?? `Snapshot ${letter}`;
                    return (
                        <React.Fragment key={item.id}>
                            {idx > 0 && <span className={styles.sep}>·</span>}
                            <span className={styles.item}>
                                <span className={styles.letter}>{letter}</span>
                                <span className={styles.id} title={title}>{item.id}</span>
                                <span className={styles.version}>{item.meta.version}</span>
                                <IconButton
                                    name="info-circle"
                                    tooltip={`Show details for ${title}`}
                                    aria-label={`Show details for ${title}`}
                                    onClick={() => setOpenIndex(idx)}
                                    size="sm"
                                />
                            </span>
                        </React.Fragment>
                    );
                })}
            </div>
            {openIndex !== null && items[openIndex] && (
                <SnapshotDetailsDrawer
                    metadata={items[openIndex].meta}
                    onClose={() => setOpenIndex(null)}
                />
            )}
        </>
    );
}

const getStyles = (theme: GrafanaTheme2) => ({
    root: css`
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: ${theme.spacing(1)};
        min-width: 0;
        flex: 1 1 auto;
    `,
    item: css`
        display: inline-flex;
        align-items: center;
        gap: ${theme.spacing(0.5)};
        background: ${theme.colors.background.secondary};
        border: 1px solid ${theme.colors.border.weak};
        border-radius: ${theme.shape.radius.default};
        padding: ${theme.spacing(0.25, 1)};
        color: ${theme.colors.text.primary};
    `,
    letter: css`
        font-weight: ${theme.typography.fontWeightBold};
        color: ${theme.colors.text.primary};
        font-size: ${theme.typography.bodySmall.fontSize};
        background: ${theme.colors.background.canvas};
        border-radius: ${theme.shape.radius.default};
        padding: ${theme.spacing(0, 0.5)};
        min-width: 18px;
        text-align: center;
    `,
    id: css`
        font-family: ${theme.typography.fontFamilyMonospace};
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.primary};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 180px;
    `,
    version: css`
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.secondary};
    `,
    sep: css`
        color: ${theme.colors.text.disabled};
    `,
});
