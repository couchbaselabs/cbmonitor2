import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import {
    SceneComponentProps,
    SceneObjectBase,
    SceneObjectState,
    sceneGraph,
} from '@grafana/scenes';
import { Icon, useStyles2 } from '@grafana/ui';
import { snapshotService } from '../../services/snapshotService';
import {
    listProductDashboards,
    matchDashboardsForProducts,
    type ProductDashboard,
} from '../../services/productDashboards';
import { buildProductDashboardUrl } from '../../utils/productDashboardUrl';
import { openInNewTab } from '../../utils/openInNewTab';
import type { Phase } from '../../types/snapshot';
import { normaliseProductList } from '../../config/products';

interface SnapshotOverviewState extends SceneObjectState {
    snapshotId: string;
}

/**
 * Synthesised fallback page rendered when a snapshot has no builtin or
 * custom tabs to show (typically external-product-only snapshots with no
 * custom_panels). Surfaces snapshot metadata and the matching product
 * dashboards so the user has a clear next step.
 */
export class SnapshotOverviewScene extends SceneObjectBase<SnapshotOverviewState> {
    static Component = SnapshotOverviewRenderer;
}

function SnapshotOverviewRenderer({ model }: SceneComponentProps<SnapshotOverviewScene>) {
    const { snapshotId } = model.useState();
    const styles = useStyles2(getStyles);
    const stored = snapshotService.getStoredSnapshotData(snapshotId);
    const metadata = stored?.metadata;

    const timeRange = sceneGraph.getTimeRange(model);
    const { value: timeRangeValue } = timeRange.useState();

    const [matches, setMatches] = useState<ProductDashboard[] | null>(null);
    useEffect(() => {
        let cancelled = false;
        listProductDashboards().then((all) => {
            if (!cancelled) {
                setMatches(matchDashboardsForProducts(all, metadata?.products));
            }
        });
        return () => {
            cancelled = true;
        };
    }, [metadata?.products]);

    if (!metadata) {
        return (
            <div className={styles.container}>
                <div className={styles.muted}>Snapshot metadata is not available.</div>
            </div>
        );
    }

    const products = normaliseProductList(metadata.products);
    const openDashboard = (dashboard: ProductDashboard) => {
        const url = buildProductDashboardUrl({
            dashboardUrl: dashboard.url,
            snapshotId,
            range: {
                from: String(timeRangeValue.raw.from),
                to: String(timeRangeValue.raw.to),
            },
        });
        openInNewTab(url);
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.heading}>Snapshot overview</h2>
            <div className={styles.muted}>
                No built-in panels apply to this snapshot&apos;s products. Open an internal-maintained
                product dashboard below, or toggle a tab back on from the settings menu.
            </div>

            <dl className={styles.facts}>
                {metadata.label && (
                    <>
                        <dt>Label</dt>
                        <dd>{metadata.label}</dd>
                    </>
                )}
                <dt>Snapshot ID</dt>
                <dd>
                    <code>{snapshotId}</code>
                </dd>
                <dt>Products</dt>
                <dd>{products.length > 0 ? products.join(', ') : <span className={styles.muted}>none</span>}</dd>
                <dt>Time range</dt>
                <dd>
                    {metadata.ts_start} <Icon name="arrow-right" /> {metadata.ts_end}
                </dd>
                {metadata.phases && metadata.phases.length > 0 && (
                    <>
                        <dt>Phases</dt>
                        <dd>{formatPhases(metadata.phases)}</dd>
                    </>
                )}
            </dl>

            <section className={styles.section}>
                <h3 className={styles.sectionHeading}>Product dashboards</h3>
                {matches === null ? (
                    <div className={styles.muted}>Looking for matching dashboards&hellip;</div>
                ) : matches.length === 0 ? (
                    <div className={styles.muted}>
                        No matching dashboards found in the <code>products</code> folder. Add one
                        named <code>&lt;product&gt;-&lt;variant&gt;</code>.
                    </div>
                ) : (
                    <ul className={styles.dashboardList}>
                        {matches.map((d) => (
                            <li key={d.uid}>
                                <button
                                    type="button"
                                    className={styles.dashboardLink}
                                    onClick={() => openDashboard(d)}
                                >
                                    <Icon name="apps" /> {d.title}
                                </button>
                                <span className={styles.muted}> &mdash; {d.product}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

function formatPhases(phases: Phase[]): string {
    return phases.map((p) => p.label).filter(Boolean).join(', ');
}

const getStyles = (theme: GrafanaTheme2) => ({
    container: css`
        padding: ${theme.spacing(3)};
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing(2)};
        max-width: 720px;
    `,
    heading: css`
        font-size: ${theme.typography.h3.fontSize};
        margin: 0;
        color: ${theme.colors.text.primary};
    `,
    sectionHeading: css`
        font-size: ${theme.typography.h5.fontSize};
        margin: 0 0 ${theme.spacing(1)} 0;
        color: ${theme.colors.text.primary};
    `,
    section: css`
        background: ${theme.colors.background.secondary};
        border: 1px solid ${theme.colors.border.weak};
        border-radius: ${theme.shape.radius.default};
        padding: ${theme.spacing(2)};
    `,
    facts: css`
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: ${theme.spacing(0.5)} ${theme.spacing(2)};
        margin: 0;

        dt {
            color: ${theme.colors.text.secondary};
            font-size: ${theme.typography.bodySmall.fontSize};
        }

        dd {
            margin: 0;
            color: ${theme.colors.text.primary};
        }
    `,
    muted: css`
        color: ${theme.colors.text.secondary};
        font-size: ${theme.typography.bodySmall.fontSize};
    `,
    dashboardList: css`
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing(0.5)};
    `,
    dashboardLink: css`
        background: none;
        border: none;
        padding: 0;
        color: ${theme.colors.text.link};
        cursor: pointer;
        font-size: ${theme.typography.body.fontSize};
        display: inline-flex;
        align-items: center;
        gap: ${theme.spacing(0.5)};

        &:hover {
            text-decoration: underline;
        }
    `,
});
