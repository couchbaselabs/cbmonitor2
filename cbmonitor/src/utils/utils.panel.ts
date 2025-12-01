// General utils for querying Couchbase cluster and handling data transformation
// using the cbdatasource plugin

import { PanelBuilders, SceneDataTransformer, SceneFlexItem, SceneQueryRunner } from '@grafana/scenes';
import { CBQueryBuilder } from './utils.cbquery';
import { layoutService } from '../services/layoutService';


export function getNewTimeSeriesDataTransformer(queryRunner: SceneQueryRunner) {
    return new SceneDataTransformer({
        $data: queryRunner,
        transformations: [
            {
                id: 'prepareTimeSeries',
                options: {
                    format: 'multi',
                },
            },
        ],
    });
}

/**
 * Create a new metric panel using the CBQueryBuilder and TimeSeriesDataTransformer
 */
export function createMetricPanel(
    snapshotId: string,
    metricName: string,
    title: string,
    options: {
        labelFilters?: Record<string, string | string[]>;
        extraFields?: string[];
        unit?: string;
        width?: string;
        height?: number;
    } = {}
): SceneFlexItem {
    const builder = new CBQueryBuilder(snapshotId, metricName);

    // Apply label filters
    if (options.labelFilters) {
        for (const [label, value] of Object.entries(options.labelFilters)) {
            builder.addLabelFilter(label, value);
        }
    }

    // Apply extra fields
    if (options.extraFields) {
        builder.setExtraFields(options.extraFields);
    }

    // Get width from explicit option, otherwise use layout service
    const panelWidth = options.width ?? layoutService.getPanelWidth();

    // Build the panel with unit configuration if provided
    const panelBuilder = PanelBuilders.timeseries()
        .setTitle(title);
    
    // Apply unit if specified
    if (options.unit) {
        panelBuilder.setUnit(options.unit);
    }

    return new SceneFlexItem({
        height: options.height ?? 300,
        width: panelWidth,
        minWidth: panelWidth === '100%' ? '100%' : '45%',
        body: panelBuilder.build(),
        $data: getNewTimeSeriesDataTransformer(builder.buildQueryRunner()),
    });
}

