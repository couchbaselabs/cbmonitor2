import React, { useState, useEffect } from 'react';
import { SceneObjectBase, SceneComponentProps, SceneObjectState } from '@grafana/scenes';
import { Combobox, ComboboxOption, Tooltip } from '@grafana/ui';
import { DataSourceConfig, DataSourceType } from 'types/datasource';
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
    const [dataSource, setDataSource] = useState<DataSourceType>(DataSourceType.Prometheus);
    const [config, setConfig] = useState<DataSourceConfig>({
        defaultDataSource: DataSourceType.Prometheus,
        prometheusAvailable: true,
        couchbaseAvailable: false,
    });

    useEffect(() => {
        let isActive = true;

        // Early return if no snapshotId yet
        if (!snapshotId) {
            return;
        }

        const loadInitialState = async () => {
            try {
                const currentDs = dataSourceService.getCurrentDataSource();
                const fullCfg = await dataSourceService.getDataSourceConfig();

                // Set initial datasource from service
                if (isActive) {
                    setConfig(fullCfg);

                    const preferredDataSource = currentDs || fullCfg.defaultDataSource;
                    const isPreferredAvailable =
                        (preferredDataSource === DataSourceType.Prometheus && fullCfg.prometheusAvailable) ||
                        (preferredDataSource === DataSourceType.Couchbase && fullCfg.couchbaseAvailable);
                    const fallbackDataSource = fullCfg.prometheusAvailable
                        ? DataSourceType.Prometheus
                        : DataSourceType.Couchbase;
                    const nextDataSource = isPreferredAvailable ? preferredDataSource : fallbackDataSource;

                    setDataSource(nextDataSource);
                    dataSourceService.setCurrentDataSource(nextDataSource);
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
            label: 'Prometheus (Default)',
            value: DataSourceType.Prometheus,
            description: 'Primary datasource',
        },
        {
            label: 'Couchbase SQL++',
            value: DataSourceType.Couchbase,
            description: 'Experimental',
        },
    ].filter(
        (option) =>
            (option.value === DataSourceType.Prometheus && config.prometheusAvailable) ||
            (option.value === DataSourceType.Couchbase && config.couchbaseAvailable)
    );

    if (options.length === 0) {
        return null;
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tooltip content="Switch between Prometheus (default) and Couchbase SQL++ (experimental)." placement="bottom">
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
