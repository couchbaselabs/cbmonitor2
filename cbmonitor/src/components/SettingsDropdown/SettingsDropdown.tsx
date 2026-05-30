import React, { useState, useEffect, useRef } from 'react';
import { css } from '@emotion/css';
import { SceneObjectBase, SceneComponentProps, SceneObjectState } from '@grafana/scenes';
import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { RadioButtonGroup, Select, Switch, ToolbarButton, useStyles2 } from '@grafana/ui';
import { Cluster } from 'types/snapshot';
import { layoutService, LayoutMode } from '../../services/layoutService';
import { dataSourceService } from '../../services/datasourceService';
import { DataSourceType } from '../../types/datasource';
import { clusterFilterService } from '../../services/clusterFilterService';
import { AvailableTab, isTabVisible } from '../../services/pageBuilder';

const ALL_CLUSTERS = '__all__';

interface SettingsDropdownState extends SceneObjectState {
    snapshotId: string;
    clusters: Cluster[];
    onLayoutChange?: () => void;
    onDataSourceChange?: () => void;
    onClusterChange?: (clusterId: string | null) => void;
    onHideEmptyChange?: () => void;
    availableTabs?: AvailableTab[];
    tabOverrides?: Record<string, boolean>;
    onTabVisibilityChange?: (next: Record<string, boolean>) => void;
    showLayoutSection?: boolean;
    showDataSourceSection?: boolean;
    showClusterSection?: boolean;
    showHideEmptySection?: boolean;
    showTabVisibilitySection?: boolean;
}

export class SettingsDropdown extends SceneObjectBase<SettingsDropdownState> {
    static Component = SettingsDropdownRenderer;

    constructor(state: SettingsDropdownState) {
        super(state);
    }
}

function SettingsDropdownRenderer({ model }: SceneComponentProps<SettingsDropdown>) {
    const {
        clusters,
        onLayoutChange,
        onDataSourceChange,
        onClusterChange,
        onHideEmptyChange,
        availableTabs,
        tabOverrides,
        onTabVisibilityChange,
        showLayoutSection = true,
        showDataSourceSection = true,
        showClusterSection = true,
        showHideEmptySection = true,
        showTabVisibilitySection = true,
    } = model.useState();

    const styles = useStyles2(getStyles);
    const [isOpen, setIsOpen] = useState(false);
    const [layout, setLayout] = useState<LayoutMode>(layoutService.getLayout());
    const [dataSource, setDataSource] = useState<DataSourceType>(dataSourceService.getCurrentDataSource());
    const [selectedCluster, setSelectedCluster] = useState<string>(clusterFilterService.getCurrentCluster() ?? ALL_CLUSTERS);
    const [hideEmpty, setHideEmpty] = useState(layoutService.getHideEmptyPanels());

    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;

            if (dropdownRef.current && dropdownRef.current.contains(target)) {
                return;
            }

            const targetElement = event.target as HTMLElement;
            const isGrafanaPortal = targetElement.closest('[data-portal="true"]') ||
                                   targetElement.closest('.grafana-portal') ||
                                   targetElement.closest('[class*="menu"]') ||
                                   targetElement.closest('[class*="Menu"]') ||
                                   targetElement.closest('[class*="Combobox"]') ||
                                   targetElement.closest('[class*="combobox"]') ||
                                   targetElement.closest('[class*="options"]') ||
                                   targetElement.closest('[class*="Options"]') ||
                                   targetElement.closest('[role="listbox"]') ||
                                   targetElement.closest('[role="option"]');

            if (isGrafanaPortal) {
                return;
            }

            setIsOpen(false);
        };

        if (isOpen) {
            const timeoutId = setTimeout(() => {
                document.addEventListener('mousedown', handleClickOutside);
            }, 0);

            return () => {
                clearTimeout(timeoutId);
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    useEffect(() => {
        const unsubscribe = layoutService.subscribe((newLayout) => {
            setLayout(newLayout);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        const unsubscribe = dataSourceService.subscribe((newDs) => {
            setDataSource(newDs);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        const unsubscribe = clusterFilterService.subscribe((clusterId) => {
            setSelectedCluster(clusterId ?? ALL_CLUSTERS);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        const unsubscribe = layoutService.subscribeHideEmpty((newHideEmpty) => {
            setHideEmpty(newHideEmpty);
        });
        return unsubscribe;
    }, []);

    const handleLayoutChange = (value: LayoutMode) => {
        layoutService.setLayout(value);
        onLayoutChange?.();
    };

    const handleDataSourceChange = (option: SelectableValue<DataSourceType> | null) => {
        if (option?.value && option.value !== dataSource) {
            dataSourceService.setCurrentDataSource(option.value);
            onDataSourceChange?.();
        }
    };

    const handleClusterChange = (option: SelectableValue<string> | null) => {
        const newValue = option?.value ?? ALL_CLUSTERS;
        setSelectedCluster(newValue);
        onClusterChange?.(newValue === ALL_CLUSTERS ? null : newValue);
    };

    const handleHideEmptyChange = (checked: boolean) => {
        layoutService.setHideEmptyPanels(checked);
        onHideEmptyChange?.();
    };

    const handleTabVisibilityChange = (tab: AvailableTab, nextVisible: boolean) => {
        const current = tabOverrides ?? {};
        const next: Record<string, boolean> = { ...current };
        if (nextVisible === tab.defaultVisible) {
            // Reverting to default — drop the override so future metadata
            // changes inherit the new default cleanly.
            delete next[tab.key];
        } else {
            next[tab.key] = nextVisible;
        }
        onTabVisibilityChange?.(next);
    };

    const layoutOptions = [
        { label: 'Grid', value: 'grid' as LayoutMode, icon: 'apps' },
        { label: 'Rows', value: 'rows' as LayoutMode, icon: 'list-ul' },
    ];

    const dataSourceOptions: Array<SelectableValue<DataSourceType>> = [
        { label: 'Prometheus', value: DataSourceType.Prometheus },
        { label: 'Couchbase SQL++', value: DataSourceType.Couchbase },
    ];

    const clusterOptions: Array<SelectableValue<string>> = [
        { label: 'All clusters', value: ALL_CLUSTERS },
        ...clusters.map((cluster, index) => ({
            label: cluster.name || `Cluster ${index + 1}`,
            value: cluster.uid,
        })),
    ];

    return (
        <div ref={dropdownRef} className={styles.wrapper}>
            <ToolbarButton
                icon="cog"
                tooltip="Settings"
                aria-label="Open settings"
                onClick={() => setIsOpen(!isOpen)}
                variant={isOpen ? 'active' : 'default'}
            />

            {isOpen && (
                <div className={styles.panel}>
                    <div className={styles.panelTitle}>Settings</div>

                    {showLayoutSection && (
                        <div className={styles.section}>
                            <div className={styles.sectionLabel}>Layout</div>
                            <RadioButtonGroup
                                options={layoutOptions}
                                value={layout}
                                onChange={handleLayoutChange}
                                size="sm"
                                fullWidth
                            />
                        </div>
                    )}

                    {showDataSourceSection && (
                        <div className={styles.section}>
                            <div className={styles.sectionLabel}>Data Source</div>
                            <Select
                                options={dataSourceOptions}
                                value={dataSource}
                                onChange={handleDataSourceChange}
                                width={30}
                            />
                        </div>
                    )}

                    {showClusterSection && clusters.length > 0 && (
                        <div className={styles.section}>
                            <div className={styles.sectionLabel}>Cluster Filter</div>
                            <Select
                                options={clusterOptions}
                                value={selectedCluster}
                                onChange={handleClusterChange}
                                placeholder="All clusters"
                                width={30}
                            />
                        </div>
                    )}

                    {showHideEmptySection && (
                        <div className={styles.toggleRow}>
                            <div className={styles.sectionLabel}>Hide Empty Panels</div>
                            <Switch
                                value={hideEmpty}
                                onChange={(e) => handleHideEmptyChange(e.currentTarget.checked)}
                            />
                        </div>
                    )}

                    {showTabVisibilitySection && availableTabs && availableTabs.length > 0 && (
                        <div className={styles.section}>
                            <div className={styles.sectionLabel}>Visible Tabs</div>
                            <div className={styles.tabList}>
                                {groupTabsByProduct(availableTabs).map((group) => (
                                    <div key={group.title} className={styles.tabGroup}>
                                        <div className={styles.tabGroupLabel}>{group.title}</div>
                                        {group.tabs.map((tab) => (
                                            <div key={tab.key} className={styles.toggleRow}>
                                                <div className={styles.tabLabel}>{tab.title}</div>
                                                <Switch
                                                    value={isTabVisible(tab, tabOverrides)}
                                                    onChange={(e) =>
                                                        handleTabVisibilityChange(tab, e.currentTarget.checked)
                                                    }
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Group available tabs by their owning product for the settings checklist,
 * preserving first-appearance order. Custom tabs fall under "Custom".
 */
function groupTabsByProduct(tabs: AvailableTab[]): Array<{ title: string; tabs: AvailableTab[] }> {
    const groups: Array<{ title: string; tabs: AvailableTab[] }> = [];
    const byTitle = new Map<string, { title: string; tabs: AvailableTab[] }>();
    for (const tab of tabs) {
        const title = tab.productTitle ?? 'Custom';
        let group = byTitle.get(title);
        if (!group) {
            group = { title, tabs: [] };
            byTitle.set(title, group);
            groups.push(group);
        }
        group.tabs.push(tab);
    }
    return groups;
}

const getStyles = (theme: GrafanaTheme2) => ({
    wrapper: css`
        position: relative;
        display: inline-flex;
    `,
    panel: css`
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: ${theme.spacing(0.5)};
        background: ${theme.colors.background.primary};
        border: 1px solid ${theme.colors.border.weak};
        border-radius: ${theme.shape.radius.default};
        padding: ${theme.spacing(2)};
        min-width: 280px;
        z-index: ${theme.zIndex.dropdown};
        box-shadow: ${theme.shadows.z3};
        color: ${theme.colors.text.primary};
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing(2)};
    `,
    panelTitle: css`
        font-size: ${theme.typography.h6.fontSize};
        font-weight: ${theme.typography.fontWeightMedium};
        color: ${theme.colors.text.primary};
    `,
    section: css`
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing(0.75)};
    `,
    sectionLabel: css`
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.secondary};
    `,
    toggleRow: css`
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: ${theme.spacing(1)};
    `,
    tabList: css`
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing(0.5)};
        max-height: 240px;
        overflow-y: auto;
        padding-right: ${theme.spacing(0.5)};
    `,
    tabLabel: css`
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.primary};
    `,
    tabGroup: css`
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing(0.5)};
    `,
    tabGroupLabel: css`
        font-size: ${theme.typography.bodySmall.fontSize};
        font-weight: ${theme.typography.fontWeightMedium};
        color: ${theme.colors.text.secondary};
        margin-top: ${theme.spacing(0.5)};
    `,
});
