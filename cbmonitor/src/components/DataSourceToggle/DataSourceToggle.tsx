import React, { useState, useEffect } from 'react';
import { SceneObjectBase, SceneComponentProps, SceneObjectState } from '@grafana/scenes';
import { Combobox, ComboboxOption, Tooltip } from '@grafana/ui';
import { DataSourceType } from 'types/datasource';
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

    useEffect(() => {
        let isActive = true;

        // Early return if no snapshotId yet
        if (!snapshotId) {
            return;
        }

        const loadInitialState = async () => {
            try {
                const config = await dataSourceService.loadConfig();
                const currentDs = dataSourceService.getCurrentDataSource();

                // Set initial datasource from service
                if (isActive) {
                    setDataSource(currentDs || config.defaultDataSource);
                }
            } catch (error) {
                console.error('[DataSourceToggle] Failed to load datasource config:', error);
            }
        };

        loadInitialState();

        // Subscribe to datasource changes
        const unsubscribe = dataSourceService.subscribe((newDataSource: DataSourceType) => {
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
            label: 'PromQL (Default)',
            value: DataSourceType.PromQL,
            description: 'Primary datasource',
        },
        {
            label: 'Couchbase SQL++',
            value: DataSourceType.Couchbase,
            description: 'Experimental',
        },
    ];

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
