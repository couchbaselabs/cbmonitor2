import React, { useState, useEffect } from 'react';
import { SceneObjectBase, SceneComponentProps, SceneObjectState } from '@grafana/scenes';
import { Combobox, ComboboxOption, Tooltip } from '@grafana/ui';
import { DataSourceAvailability, DataSourceType } from 'types/datasource';
import { dataSourceService } from 'services/datasourceService';

interface DataSourceToggleState extends SceneObjectState {
    snapshotId: string;
    onDataSourceChange?: () => void;
}

export class DataSourceToggle extends SceneObjectBase<DataSourceToggleState> {
    static Component = DataSourceToggleRenderer;

    constructor(state: DataSourceToggleState) {
        super(state);
    }
}

function DataSourceToggleRenderer({ model }: SceneComponentProps<DataSourceToggle>) {
    const state = model.useState();
    const { onDataSourceChange, snapshotId } = state || {};
    const [dataSource, setDataSource] = useState<DataSourceType>(DataSourceType.PromQL);
    const [availability, setAvailability] = useState<DataSourceAvailability | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isActive = true;

        // Early return if no snapshotId yet
        if (!snapshotId) {
            setAvailability(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setAvailability(null);

        const loadAvailability = async () => {
            try {
                const config = await dataSourceService.loadConfig();
                const currentDs = dataSourceService.getCurrentDataSource();

                // Set initial datasource (load immediately, don't wait for health check)
                if (isActive) {
                    setDataSource(currentDs || config.defaultDataSource);
                    setLoading(false);
                }

                // Check availability in background (non-blocking)
                dataSourceService.checkSnapshotAvailability(snapshotId).then((avail) => {
                    if (isActive) {
                        setAvailability(avail.availability);
                    }
                }).catch((error) => {
                    console.error('Failed to check datasource availability:', error);
                });
            } catch (error) {
                console.error('Failed to load datasource config:', error);
                if (isActive) {
                    setLoading(false);
                }
            }
        };

        loadAvailability();

        // Subscribe to datasource changes
        const unsubscribe = dataSourceService.subscribe((newDataSource) => {
            if (isActive) {
                setDataSource(newDataSource);
            }
        });

        return () => {
            isActive = false;
            unsubscribe();
        };
    }, [snapshotId]);

    const handleChange = (option: ComboboxOption<DataSourceType> | null) => {
        if (option?.value) {
            if (option.value === dataSource) {
                return;
            }
            dataSourceService.setCurrentDataSource(option.value);
            // Trigger callback to reload dashboards
            if (onDataSourceChange) {
                onDataSourceChange();
            }
        }
    };

    const options: Array<ComboboxOption<DataSourceType>> = [
        {
            label: availability?.promql ? 'PromQL (Default) ✓' : 'PromQL (Default) ✗',
            value: DataSourceType.PromQL,
            description: 'Default',
        },
        {
            label: availability?.couchbase ? 'Couchbase SQL++ ✓' : 'Couchbase SQL++ ✗',
            value: DataSourceType.Couchbase,
            description: 'Experimental',
        },
    ];

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', minWidth: '180px' }}>
                <Combobox
                    options={[{ label: 'Loading...', value: 'loading' as any }]}
                    value="loading"
                    onChange={() => { }}
                    isClearable={false}
                    disabled
                    width={22}
                />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tooltip content="Switch between PromQL (default) and Couchbase SQL++ (experimental)." placement="bottom">
                <span>
                    <Combobox
                        options={options}
                        value={dataSource}
                        onChange={(option) => handleChange(option)}
                        isClearable={false}
                        width={22}
                        placeholder="DataSource"
                    />
                </span>
            </Tooltip>
        </div>
    );
}
