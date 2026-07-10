import { PanelBuilders, SceneDataTransformer, SceneFlexItem, SceneQueryRunner } from "@grafana/scenes";
import { FieldType } from "@grafana/data";
import { hasDataValues } from "./utils.panel";
import { PROXY_PROM_DATASOURCE_REF } from "../constants";
import { LegendDisplayMode, TooltipDisplayMode } from "@grafana/schema";
import { layoutService } from "services/layoutService";
import { NoUrlSyncTimeRange } from "./timeRange";
import { overlapQueryCacheService } from "../services/overlapQueryCache";

let panelIdCounter = 0;
const DEFAULT_OVERLAP_END_TIME_SECONDS = 3 * 60 * 60;

type OverlapPanelOptions = {
    expr: string;
    legendFormat?: string;
    unit?: string;
    width?: number | string;
    height?: number | string;
    overlapEndTimeSeconds?: number;
}

function resolveOverlapEndTimeSeconds(overlapEndTimeSeconds?: number): number {
    const value = overlapEndTimeSeconds ?? DEFAULT_OVERLAP_END_TIME_SECONDS;
    // Value must be a finite positive number of seconds. Fall back to default rather
    // than silently producing a broken time range.
    if (!Number.isFinite(value) || value <= 0) {
        return DEFAULT_OVERLAP_END_TIME_SECONDS;
    }
    return Math.floor(value);
}

function createOverlapTimeRange(overlapEndTimeSeconds?: number): NoUrlSyncTimeRange {
    const endTimeSeconds = resolveOverlapEndTimeSeconds(overlapEndTimeSeconds);
    return new NoUrlSyncTimeRange({
        from: new Date(0).toISOString(),
        to: new Date(endTimeSeconds * 1000).toISOString(),
        timeZone: 'utc',
    });
}

function createOverlapDataTransformer(queryRunner: SceneQueryRunner): SceneDataTransformer {
    return new SceneDataTransformer({
        $data: queryRunner,
        transformations: [
            {
                id: 'prepareTimeSeries',
                options: {
                    format: 'multi',
                },
            },
            {
                id: 'joinByField',
                options: {
                    byField: 'Time',
                    mode: 'outer',
                },
            },
            {
                id: 'convertFieldType',
                options: {
                    conversions: [
                        { targetField: 'Time', destinationType: FieldType.number },
                    ],
                },
            },
            {
                id: 'calculateField',
                options: {
                    mode: 'binary',
                    binary: {
                        left: 'Time',
                        operator: '/',
                        right: '1000',
                    },
                    alias: 'TimeSeconds',
                    replaceFields: false,
                },
            },
        ],
    });
}

function getCachedOverlapQueryRunner(metricName: string, options: OverlapPanelOptions, timeRange: NoUrlSyncTimeRange): SceneQueryRunner {
    const from = timeRange.state.value.from.toISOString();
    const to = timeRange.state.value.to.toISOString();

    return overlapQueryCacheService.getOrCreateRunner({
        keyParts: [
            'overlap-panel',
            PROXY_PROM_DATASOURCE_REF.uid,
            metricName,
            options.expr,
            options.legendFormat,
            from,
            to,
        ],
        createRunner: () => {
            const runner = new SceneQueryRunner({
                $timeRange: timeRange,
                datasource: PROXY_PROM_DATASOURCE_REF,
                queries: [{
                    refId: metricName,
                    expr: options.expr,
                    legendFormat: options.legendFormat,
                }],
            });
            (runner as any).run?.();
            return runner;
        },
    });
}

export function createOverlapMetricPanel(
    metricName: string,
    title: string,
    options: OverlapPanelOptions
): SceneFlexItem {
    const endTimeSeconds = resolveOverlapEndTimeSeconds(options.overlapEndTimeSeconds);
    const panelWidth = options.width ?? layoutService.getPanelWidth();
    const timeRange = createOverlapTimeRange(options.overlapEndTimeSeconds);
    const panelBuilder = PanelBuilders.trend().setTitle(title) as any;
    panelBuilder.setOption('tooltip', { mode: TooltipDisplayMode.Multi });
    panelBuilder.setOption('legend', {
        showLegend: true,
        placement: 'bottom',
        displayMode: LegendDisplayMode.List,
        sortBy: 'Name',
        sortDesc: false,
    });
    
    panelBuilder.setUnit(options.unit ?? 'short');
    panelBuilder.setOption('xField', 'TimeSeconds');
    panelBuilder.setOverrides((b: any) => {
        b.matchFieldsWithName('Time').overrideCustomFieldConfig('hideFrom', {
            viz: true,
            legend: true,
            tooltip: true,
        });
        // Pin the visible x-domain to overlap bounds even when first/last points are not at 0/end.
        b.matchFieldsWithName('TimeSeconds').overrideUnit('dtdhms').overrideMin(0).overrideMax(endTimeSeconds);
        // this does not work and needs DEBUGGING
        if (options.legendFormat) {
            const legendTemplate = options.legendFormat.replace(/\{\{(\w+)\}\}/g, '${__field.labels.$1}');
            b.matchFieldsByQuery(metricName).overrideDisplayName(legendTemplate);
        }
    });
    
    // Description
    try {
        const descriptionMd = [
            `**Metric:** ${metricName} \n`,
            `**Datasource:** Proxy Prometheus \n`,
            '',
            '**Query:**',
            '```promql',
            options.expr,
            '```',
        ].join('\n');
        panelBuilder.setDescription(descriptionMd);
    } catch (_e) { /* skip */ }

    const panel = panelBuilder.build();
    const queryRunner = getCachedOverlapQueryRunner(metricName, options, timeRange);
    const dataTransformer = createOverlapDataTransformer(queryRunner);

    // Generate unique panel ID
    const panelId = `panel-${metricName}-${++panelIdCounter}`;

    // Check if we should hide this panel when empty
    const shouldHideWhenEmpty = layoutService.getHideEmptyPanels();
    const flexItem = new SceneFlexItem({
        key: panelId,
        $timeRange: timeRange,
        height: options.height ?? 400,
        width: panelWidth,
        minWidth: panelWidth === '100%' ? '100%' : '45%',
        body: panel,
        $data: dataTransformer,
        isHidden: false, // Start visible, will hide if no data
    });

    // If hideEmpty is enabled, add a behavior to watch data and toggle isHidden
    if (shouldHideWhenEmpty) {
        // Subscribe to data transformer state changes
        dataTransformer.subscribeToState((state) => {
            // Skip if still loading
            if (state.data?.state === 'Loading') {
                return;
            }

            const hasData = hasDataValues(state);
            const currentHidden = flexItem.state.isHidden;

            // Only update if state needs to change
            if (hasData && currentHidden) {
                flexItem.setState({ isHidden: false });
            } else if (!hasData && !currentHidden) {
                flexItem.setState({ isHidden: true });
            }
        });
    }

    return flexItem;
    
}
