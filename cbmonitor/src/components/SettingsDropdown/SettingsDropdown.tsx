import React, { useState, useEffect, useRef } from 'react';
import { SceneObjectBase, SceneComponentProps, SceneObjectState } from '@grafana/scenes';
import { Icon, RadioButtonGroup, Combobox, ComboboxOption, Switch } from '@grafana/ui';
import { Cluster } from 'types/snapshot';
import { layoutService, LayoutMode } from '../../services/layoutService';
import { dataSourceService } from '../../services/datasourceService';
import { DataSourceType } from '../../types/datasource';
import { clusterFilterService } from '../../services/clusterFilterService';

const ALL_CLUSTERS = '__all__';

interface SettingsDropdownState extends SceneObjectState {
    snapshotId: string;
    clusters: Cluster[];
    onLayoutChange: () => void;
    onDataSourceChange: () => void;
    onClusterChange: (clusterId: string | null) => void;
    onHideEmptyChange: () => void;
}

export class SettingsDropdown extends SceneObjectBase<SettingsDropdownState> {
    static Component = SettingsDropdownRenderer;

    constructor(state: SettingsDropdownState) {
        super(state);
    }
}

function SettingsDropdownRenderer({ model }: SceneComponentProps<SettingsDropdown>) {
    const { clusters, onLayoutChange, onDataSourceChange, onClusterChange, onHideEmptyChange } = model.useState();
    
    const [isOpen, setIsOpen] = useState(false);
    const [layout, setLayout] = useState<LayoutMode>(layoutService.getLayout());
    const [dataSource, setDataSource] = useState<DataSourceType>(dataSourceService.getCurrentDataSource());
    const [selectedCluster, setSelectedCluster] = useState<string>(clusterFilterService.getCurrentCluster() ?? ALL_CLUSTERS);
    const [hideEmpty, setHideEmpty] = useState(layoutService.getHideEmptyPanels());
    
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            
            // Don't close if clicking inside our dropdown
            if (dropdownRef.current && dropdownRef.current.contains(target)) {
                return;
            }
            
            // Don't close if clicking on Grafana UI portals (Combobox dropdowns, etc.)
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
            // Use setTimeout to avoid immediate trigger on same click that opened the dropdown
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

    // Subscribe to layout changes
    useEffect(() => {
        const unsubscribe = layoutService.subscribe((newLayout) => {
            setLayout(newLayout);
        });
        return unsubscribe;
    }, []);

    // Subscribe to datasource changes
    useEffect(() => {
        const unsubscribe = dataSourceService.subscribe((newDs) => {
            setDataSource(newDs);
        });
        return unsubscribe;
    }, []);

    // Subscribe to cluster filter changes
    useEffect(() => {
        const unsubscribe = clusterFilterService.subscribe((clusterId) => {
            setSelectedCluster(clusterId ?? ALL_CLUSTERS);
        });
        return unsubscribe;
    }, []);

    // Subscribe to hideEmpty changes
    useEffect(() => {
        const unsubscribe = layoutService.subscribeHideEmpty((newHideEmpty) => {
            setHideEmpty(newHideEmpty);
        });
        return unsubscribe;
    }, []);

    const handleLayoutChange = (value: LayoutMode) => {
        layoutService.setLayout(value);
        onLayoutChange();
    };

    const handleDataSourceChange = (option: ComboboxOption<DataSourceType> | null) => {
        if (option?.value && option.value !== dataSource) {
            dataSourceService.setCurrentDataSource(option.value);
            onDataSourceChange();
        }
    };

    const handleClusterChange = (option: ComboboxOption<string> | null) => {
        const newValue = option?.value ?? ALL_CLUSTERS;
        setSelectedCluster(newValue);
        onClusterChange(newValue === ALL_CLUSTERS ? null : newValue);
    };

    const handleHideEmptyChange = (checked: boolean) => {
        layoutService.setHideEmptyPanels(checked);
        onHideEmptyChange();
    };

    const layoutOptions = [
        { label: 'Grid', value: 'grid' as LayoutMode, icon: 'apps' },
        { label: 'Rows', value: 'rows' as LayoutMode, icon: 'list-ul' },
    ];

    const dataSourceOptions: Array<ComboboxOption<DataSourceType>> = [
        { label: 'Prometheus', value: DataSourceType.Prometheus },
        { label: 'Couchbase SQL++', value: DataSourceType.Couchbase },
    ];

    const clusterOptions: Array<ComboboxOption<string>> = [
        { label: 'All clusters', value: ALL_CLUSTERS },
        ...clusters.map((cluster, index) => ({
            label: cluster.name || `Cluster ${index + 1}`,
            value: cluster.uid,
        })),
    ];

    return (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: 'transparent',
                    border: '1px solid #374151',
                    borderRadius: 4,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#E5E7EB',
                }}
                title="Settings"
            >
                <Icon name="ellipsis-v" size="lg" />
            </button>

            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: 4,
                        background: '#111827',
                        border: '1px solid #374151',
                        borderRadius: 8,
                        padding: 16,
                        minWidth: 280,
                        zIndex: 1000,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                >
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#E5E7EB' }}>
                        Settings
                    </div>

                    {/* Layout Section */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>Layout</div>
                        <RadioButtonGroup
                            options={layoutOptions}
                            value={layout}
                            onChange={handleLayoutChange}
                            size="sm"
                            fullWidth
                        />
                    </div>

                    {/* Datasource Section */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>Data Source</div>
                        <Combobox
                            options={dataSourceOptions}
                            value={dataSource}
                            onChange={handleDataSourceChange}
                            width={30}
                        />
                    </div>

                    {/* Cluster Section - only show if clusters exist */}
                    {clusters.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>Cluster Filter</div>
                            <Combobox
                                options={clusterOptions}
                                value={selectedCluster}
                                onChange={handleClusterChange}
                                placeholder="All clusters"
                                width={30}
                            />
                        </div>
                    )}

                    {/* Hide Empty Panels */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 12, color: '#9CA3AF' }}>Hide Empty Panels</div>
                        <Switch
                            value={hideEmpty}
                            onChange={(e) => handleHideEmptyChange(e.currentTarget.checked)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
