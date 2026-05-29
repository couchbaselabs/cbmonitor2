import React, { useEffect, useMemo, useState } from 'react';
import { SceneTimeRange } from '@grafana/scenes';
import { Dropdown, Menu, ToolbarButton } from '@grafana/ui';
import {
    listProductDashboards,
    matchDashboardsForProducts,
    type ProductDashboard,
} from '../../../services/productDashboards';
import { buildProductDashboardUrl } from '../../../utils/productDashboardUrl';

interface ProductDashboardsButtonProps {
    snapshotId: string;
    timeRange: SceneTimeRange;
    products?: string[];
}

export function ProductDashboardsButton({ snapshotId, timeRange, products }: ProductDashboardsButtonProps) {
    const [allDashboards, setAllDashboards] = useState<ProductDashboard[] | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        listProductDashboards().then((d) => {
            if (!cancelled) {
                setAllDashboards(d);
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const { value } = timeRange.useState();

    const matches = useMemo(
        () => (allDashboards ? matchDashboardsForProducts(allDashboards, products) : []),
        [allDashboards, products],
    );

    if (!allDashboards || matches.length === 0) {
        return null;
    }

    const grouped = groupByProduct(matches);
    const range = { from: String(value.raw.from), to: String(value.raw.to) };

    const overlay = (
        <Menu>
            {grouped.map(([product, items]) => (
                <Menu.Group key={product} label={product}>
                    {items.map((d) => (
                        <Menu.Item
                            key={d.uid}
                            label={d.title}
                            url={buildProductDashboardUrl({
                                dashboardUrl: d.url,
                                snapshotId,
                                range,
                            })}
                            target="_blank"
                        />
                    ))}
                </Menu.Group>
            ))}
        </Menu>
    );

    return (
        <Dropdown overlay={overlay} placement="bottom-end" onVisibleChange={setIsOpen}>
            <ToolbarButton
                icon="apps"
                tooltip="Open an internal-maintained product dashboard scoped to this snapshot. Time range and job id are pre-filled."
                aria-label="Open product dashboard"
                isOpen={isOpen}
            >
                Product dashboards
            </ToolbarButton>
        </Dropdown>
    );
}

function groupByProduct(dashboards: ProductDashboard[]): Array<[string, ProductDashboard[]]> {
    const map = new Map<string, ProductDashboard[]>();
    for (const d of dashboards) {
        const list = map.get(d.product);
        if (list) {
            list.push(d);
        } else {
            map.set(d.product, [d]);
        }
    }
    return Array.from(map.entries());
}
