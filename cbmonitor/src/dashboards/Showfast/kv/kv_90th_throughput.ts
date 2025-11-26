import {
    EmbeddedScene,
    SceneFlexLayout,
    SceneFlexItem,
    SceneVariableSet,
} from '@grafana/scenes';
import { PanelBuilders } from '@grafana/scenes';
import { ShowfastQueryBuilder, createShowfastQueries } from '../../../utils/utils.showfast';

/**
 * Creates a dynamic KV throughput dashboard using the ShowfastQueryBuilder
 * This dashboard shows performance metrics from external APIs via Showfast
 */
export function kvThroughputDashboard(): EmbeddedScene {
    // Create template variables for dynamic metric selection
    const variables = ShowfastQueryBuilder.buildVariableSet(['kv']);

    return new EmbeddedScene({
        $variables: variables,
        body: new SceneFlexLayout({
            minHeight: 50,
            direction: 'row',
            wrap: 'wrap',
            children: [
                // KV Max Ops Performance Panel
                new SceneFlexItem({
                    height: 400,
                    width: '50%',
                    minWidth: '45%',
                    body: PanelBuilders.barchart()
                        .setTitle('KV Max Ops Performance')
                        .build(),
                    $data: new ShowfastQueryBuilder('kv', 'max_ops')
                        .setVisualizationType('barchart')
                        .useTimelineData(true)
                        .buildQueryRunner()
                }),

                // KV Max Ops SSL Performance Panel
                new SceneFlexItem({
                    height: 400,
                    width: '50%',
                    minWidth: '45%',
                    body: PanelBuilders.timeseries()
                        .setTitle('KV Max Ops SSL')
                        .setUnit('ops')
                        .build(),
                    $data: new ShowfastQueryBuilder('kv', 'max_ops_ssl')
                        .setVisualizationType('timeseries')
                        .useTimelineData(true)
                        .buildQueryRunner()
                }),

                // KV 95th Percentile Latency Panel
                new SceneFlexItem({
                    height: 400,
                    width: '50%',
                    minWidth: '45%',
                    body: PanelBuilders.timeseries()
                        .setTitle('KV 95th Percentile Latency')
                        .setUnit('ms')
                        .build(),
                    $data: new ShowfastQueryBuilder('kv', 'latency_95th')
                        .setVisualizationType('timeseries')
                        .useTimelineData(true)
                        .buildQueryRunner()
                }),

                // KV Metrics Table Panel
                new SceneFlexItem({
                    height: 400,
                    width: '50%',
                    minWidth: '45%',
                    body: PanelBuilders.table()
                        .setTitle('Available KV Metrics')
                        .build(),
                    $data: new ShowfastQueryBuilder('kv', 'max_ops')
                        .setVisualizationType('table')
                        .useTimelineData(false) // Use metrics endpoint for table
                        .buildQueryRunner()
                })
            ]
        })
    });
}