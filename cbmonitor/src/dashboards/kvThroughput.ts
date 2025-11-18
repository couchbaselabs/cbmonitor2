import {
    EmbeddedScene,
    SceneFlexLayout,
    SceneFlexItem,
    SceneQueryRunner,
} from '@grafana/scenes';
import { PanelBuilders } from '@grafana/scenes';

/**
 * Creates a KV throughput dashboard using Infinity datasource
 * This dashboard shows performance metrics from external APIs via Showfast
 */
export function kvThroughputDashboard(): EmbeddedScene {
    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50,
            direction: 'row',
            wrap: 'wrap',
            children: [
                // KV Throughput Performance Panel
                new SceneFlexItem({
                    height: 400,
                    width: '50%',
                    minWidth: '45%',
                    body: PanelBuilders.barchart()
                        .setTitle('KV Throughput Performance')
                        .build(),
                    $data: new SceneQueryRunner({
                        datasource: {
                            type: 'yesoreyeram-infinity-datasource',
                            uid: 'Showfast'
                        },
                        queries: [
                            {
                                refId: 'A',
                                queryType: 'infinity',
                                type: 'json',
                                source: 'url',
                                format: 'table',
                                url: '/api/v1/timeline/kv_max_ops_linux',
                                parser: 'simple',
                                root_selector: '$',
                                columns: [
                                    {
                                        selector: 'build',
                                        text: 'build',
                                        type: 'string'
                                    },
                                    {
                                        selector: 'metric',
                                        text: 'metric',
                                        type: 'number'
                                    }
                                ]
                            }
                        ]
                    })
                }),

                // KV Max Ops Linux Panel
                new SceneFlexItem({
                    height: 400,
                    width: '50%',
                    minWidth: '45%',
                    body: PanelBuilders.timeseries()
                        .setTitle('KV Max Ops Linux')
                        .setUnit('ops')
                        .build(),
                    $data: new SceneQueryRunner({
                        datasource: {
                            type: 'yesoreyeram-infinity-datasource',
                            uid: 'Showfast'
                        },
                        queries: [
                            {
                                refId: 'B',
                                queryType: 'infinity',
                                type: 'json',
                                source: 'url',
                                format: 'table',
                                url: '/api/v1/metrics/kv/max_ops/all',
                                parser: 'simple',
                                root_selector: '$',
                                columns: [
                                    {
                                        selector: 'build',
                                        text: 'build',
                                        type: 'string'
                                    },
                                    {
                                        selector: 'metric',
                                        text: 'metric',
                                        type: 'number'
                                    }
                                ]
                            }
                        ]
                    })
                }),

                // KV Latency Panel
                new SceneFlexItem({
                    height: 400,
                    width: '50%',
                    minWidth: '45%',
                    body: PanelBuilders.timeseries()
                        .setTitle('KV Latency Performance')
                        .setUnit('ms')
                        .build(),
                    $data: new SceneQueryRunner({
                        datasource: {
                            type: 'yesoreyeram-infinity-datasource',
                            uid: 'Showfast'
                        },
                        queries: [
                            {
                                refId: 'C',
                                queryType: 'infinity',
                                type: 'json',
                                source: 'url',
                                format: 'table',
                                url: '/api/v1/metrics/kv/latency_95th/all',
                                parser: 'simple',
                                root_selector: '$',
                                columns: [
                                    {
                                        selector: 'build',
                                        text: 'build',
                                        type: 'string'
                                    },
                                    {
                                        selector: 'metric',
                                        text: 'metric',
                                        type: 'number'
                                    }
                                ]
                            }
                        ]
                    })
                }),

                // Mixed Workload Panel
                new SceneFlexItem({
                    height: 400,
                    width: '50%',
                    minWidth: '45%',
                    body: PanelBuilders.barchart()
                        .setTitle('Mixed Workload Performance')
                        .setUnit('ops')
                        .build(),
                    $data: new SceneQueryRunner({
                        datasource: {
                            type: 'yesoreyeram-infinity-datasource',
                            uid: 'Showfast'
                        },
                        queries: [
                            {
                                refId: 'D',
                                queryType: 'infinity',
                                type: 'json',
                                source: 'url',
                                format: 'table',
                                url: '/api/v1/metrics/mixed/throughput/all',
                                parser: 'simple',
                                root_selector: '$',
                                columns: [
                                    {
                                        selector: 'build',
                                        text: 'build',
                                        type: 'string'
                                    },
                                    {
                                        selector: 'metric',
                                        text: 'metric',
                                        type: 'number'
                                    }
                                ]
                            }
                        ]
                    })
                })
            ]
        })
    });
}