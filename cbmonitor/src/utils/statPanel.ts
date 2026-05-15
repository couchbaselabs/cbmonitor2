import { PanelBuilders, SceneFlexItem, SceneQueryRunner } from '@grafana/scenes';
import { BigValueColorMode, BigValueGraphMode } from '@grafana/schema';
import { clusterFilterService } from '../services/clusterFilterService';
import { instanceFilterService } from '../services/instanceFilterService';
import { injectClusterFilter, injectInstanceFilter } from './utils.panel';
import { PROM_DATASOURCE_REF } from '../constants';

export interface StatPanelOptions {
    expr: string;
    unit?: string;
    decimals?: number;
    width?: string | number;
    minWidth?: string | number;
    height?: number;
    graphMode?: BigValueGraphMode;
    calc?: 'mean' | 'lastNotNull' | 'max' | 'min' | 'sum';
}

/**
 * Stat-style summary panel: PromQL query → big-number reducer + optional
 * sparkline. Applies the active cluster + instance filters via the shared
 * inject helpers so a stat panel automatically scopes to the same context
 * as the timeseries panels around it.
 *
 * PromQL-only for now (drilldown summaries don't need the SQL++ path that
 * `createMetricPanel` carries).
 */
export function createStatPanel(
    metricName: string,
    title: string,
    options: StatPanelOptions
): SceneFlexItem {
    const cluster = clusterFilterService.getCurrentCluster();
    const instance = instanceFilterService.getCurrentInstance();
    let expr = options.expr;
    if (cluster) {
        expr = injectClusterFilter(expr, cluster);
    }
    if (instance) {
        expr = injectInstanceFilter(expr, instance);
    }

    const queryRunner = new SceneQueryRunner({
        datasource: PROM_DATASOURCE_REF,
        queries: [{ refId: metricName, expr }],
    });

    const builder = PanelBuilders.stat()
        .setTitle(title)
        .setData(queryRunner)
        .setOption('reduceOptions', {
            calcs: [options.calc ?? 'lastNotNull'],
            fields: '',
            values: false,
        })
        .setOption('graphMode', options.graphMode ?? BigValueGraphMode.Area)
        .setOption('colorMode', BigValueColorMode.Value);

    if (options.unit) {
        builder.setUnit(options.unit);
    }
    if (options.decimals !== undefined) {
        builder.setDecimals(options.decimals);
    }

    return new SceneFlexItem({
        height: options.height ?? 120,
        // Leave `width` undefined when the caller doesn't supply one so the
        // panel flex-grows to share the row equally with its siblings —
        // `minWidth` still triggers wrapping on narrow screens.
        width: options.width,
        minWidth: options.minWidth ?? '180px',
        body: builder.build(),
    });
}
