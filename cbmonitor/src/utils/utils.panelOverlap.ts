import { PanelBuilders, SceneDataTransformer, SceneFlexItem, SceneQueryRunner } from "@grafana/scenes";
import { FieldType } from "@grafana/data";
import { hasDataValues } from "./utils.panel";
import { EVIL_PROM_DATASOURCE_REF } from "../constants";
import { LegendDisplayMode, TooltipDisplayMode } from "@grafana/schema";
import { layoutService } from "services/layoutService";
import { NoUrlSyncTimeRange } from "./timeRange";

let panelIdCounter = 0;

type OverlapPanelOptions = {
    expr: string;
    legendFormat?: string;
    unit?: string;
    width?: string;
    height?: string;
    overlapEndTimeSeconds?: number;
}

function normalizeToSeconds(value?: number): number {
    if (!value || !Number.isFinite(value)) {
        return 1;
    }

    // Guard against accidental millisecond values passed through overlap wiring.
    return value > 1e10 ? Math.floor(value / 1000) : Math.floor(value);
}

function createOverlapTimeRange(overlapEndTimeSeconds?: number): NoUrlSyncTimeRange {
    const endTimeSeconds = Math.max(1, normalizeToSeconds(overlapEndTimeSeconds));
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

export function createOverlapMetricPanel(
    metricName: string,
    title: string,
    options: OverlapPanelOptions
) : SceneFlexItem {
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
        b.matchFieldsWithName('TimeSeconds').overrideUnit('dtdhms');
        // this does not work and needs DEBUGGING
        if (options.legendFormat) {
            options.legendFormat.replace(/\{\{(\w+)\}\}/g, '${__field.labels.$1}');
            b.matchFieldsByQuery(metricName).overrideDisplayName("abc");
        }
    });
    
    // Description
    try {
        const descriptionMd = [
            `**Metric:** ${metricName} \n`,
            `**Datasource:** Evil Prometheus \n`,
            '',
            '**Query:**',
            '```promql',
            options.expr,
            '```',
        ].join('\n');
        panelBuilder.setDescription(descriptionMd);
    } catch (_e) { /* skip */ }

    const panel = panelBuilder.build();
    const queryRunner = new SceneQueryRunner({
                $timeRange: timeRange,
                datasource: EVIL_PROM_DATASOURCE_REF,
                queries: [{
                    refId: metricName,
                    expr: options.expr,
                    legendFormat: options.legendFormat,
                }],
            });
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
