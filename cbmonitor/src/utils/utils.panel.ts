// General utils for querying Couchbase cluster and handling data transformation
// using the cbdatasource plugin

import { PanelBuilders, SceneDataTransformer, SceneFlexItem, SceneQueryRunner } from '@grafana/scenes';
import { CB_DATASOURCE_REF } from '../constants';

export function getNewCBQueryRunner(snapshotId: string, metricName: string, from: string, to: string, extra_fields = 'd.labels.instance', proc = '') {
    return new SceneQueryRunner({
        datasource: CB_DATASOURCE_REF,
        queries: [
            {
                refId: `${metricName}`,
                query: `SELECT MILLIS_TO_STR(t._t) AS time, t._v0 AS \`${metricName}\`, ${extra_fields} FROM get_metric_for('${metricName}', '${snapshotId}') AS d UNNEST _timeseries(d,{'ts_ranges':[${from},${to}]}) AS t WHERE ${proc ? `d.labels.proc='${proc}' AND` : ''} time_range(t._t)`, // TODO: Use a proper query builder
            },
        ],
    });
}

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

export function getNewTransformedCBQueryRunner(snapshotId: string, metricName: string, from: string, to: string, extra_fields = 'd.labels.instance', proc = '') {
    return getNewTimeSeriesDataTransformer(getNewCBQueryRunner(snapshotId, metricName, from, to, extra_fields, proc));
}


export function getSnapshotPanel(snapshotId: string, metricName: string, title: string, extra_fields = 'd.labels.instance', proc = '') {
    return new SceneFlexItem({
        height: 300,
        width: "49%",
        minWidth: "45%",
        body: PanelBuilders.timeseries()
            .setTitle(title)
            .build(),
        $data: getNewTransformedCBQueryRunner(snapshotId, metricName, '${__from}', '${__to}', extra_fields, proc),
    });
}
