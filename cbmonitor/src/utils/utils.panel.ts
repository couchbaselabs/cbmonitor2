// General utils for querying Couchbase cluster and handling data transformation
// using the cbdatasource plugin

import { PanelBuilders, SceneDataTransformer, SceneFlexItem, SceneQueryRunner } from '@grafana/scenes';
import { CBQueryBuilder, AggregationQueryBuilder } from './utils.cbquery';
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
        displayNameTemplate?: string;
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

    const panel = panelBuilder.build();

    // Apply legend display name override when requested
    if (options.displayNameTemplate) {
        const currentState: any = (panel as any).state ?? {};
        const currentOptions: any = currentState.options ?? {};
        const fieldConfig: any = currentOptions.fieldConfig ?? { defaults: {}, overrides: [] };
        const overrides = Array.isArray(fieldConfig.overrides) ? fieldConfig.overrides.slice() : [];

        overrides.push({
            matcher: { id: 'byType', options: 'number' },
            properties: [{ id: 'displayName', value: options.displayNameTemplate }],
        });

        (panel as any).setState({
            options: {
                ...currentOptions,
                fieldConfig: {
                    ...fieldConfig,
                    overrides,
                },
            },
        });
    }

    return new SceneFlexItem({
        height: options.height ?? 300,
        width: panelWidth,
        minWidth: panelWidth === '100%' ? '100%' : '45%',
        body: panel,
        $data: getNewTimeSeriesDataTransformer(builder.buildQueryRunner()),
    });
}

/**
 * Create a new metric panel using AggregationQueryBuilder and TimeSeriesDataTransformer
 *
 * This mirrors createMetricPanel but builds the query via AggregationQueryBuilder,
 * allowing a timeseries transform (e.g., rate) to be applied before expansion.
 */
export function createAggregatedMetricPanel(
    snapshotId: string,
    metricName: string,
    title: string,
    options: {
        labelFilters?: Record<string, string | string[]>;
        extraFields?: string[];
        unit?: string;
        width?: string;
        height?: number;
        displayNameTemplate?: string;
        transformFunction?: string; // e.g., 'rate', 'avg_timeseries'
    } = {}
): SceneFlexItem {
    const builder = new AggregationQueryBuilder(snapshotId, metricName);

    // Optional transform function (defaults in builder)
    if (options.transformFunction) {
        builder.setTransformFunction(options.transformFunction);
    }

    // Apply label filters
    if (options.labelFilters) {
        for (const [label, value] of Object.entries(options.labelFilters)) {
            builder.addLabelFilter(label, value);
        }
    }

    // Apply extra fields (use d.* fields; builder remaps aliases)
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

    const panel = panelBuilder.build();

    // Apply legend display name override when requested
    if (options.displayNameTemplate) {
        const currentState: any = (panel as any).state ?? {};
        const currentOptions: any = currentState.options ?? {};
        const fieldConfig: any = currentOptions.fieldConfig ?? { defaults: {}, overrides: [] };
        const overrides = Array.isArray(fieldConfig.overrides) ? fieldConfig.overrides.slice() : [];

        overrides.push({
            matcher: { id: 'byType', options: 'number' },
            properties: [{ id: 'displayName', value: options.displayNameTemplate }],
        });

        (panel as any).setState({
            options: {
                ...currentOptions,
                fieldConfig: {
                    ...fieldConfig,
                    overrides,
                },
            },
        });
    }

    return new SceneFlexItem({
        height: options.height ?? 300,
        width: panelWidth,
        minWidth: panelWidth === '100%' ? '100%' : '45%',
        body: panel,
        $data: getNewTimeSeriesDataTransformer(builder.buildQueryRunner()),
    });
}

