import { PanelBuilders, SceneDataTransformer, SceneFlexItem, SceneQueryRunner } from "@grafana/scenes";
import { FieldType } from "@grafana/data";
import { hasDataValues } from "./utils.panel";
import { EVIL_PROM_DATASOURCE_REF } from "../constants";
import { LegendDisplayMode, TooltipDisplayMode } from "@grafana/schema";
import { layoutService } from "services/layoutService";
import { EndTime } from "services/snapshotLoader";
import { NoUrlSyncTimeRange } from "./timeRange";

let panelIdCounter = 0;

type OverlapPanelOptions = {
    expr: string;
    legendFormat?: string;
    unit?: string;
    width?: string;
    height?: string;
}

function createOverlapTimeRange(): NoUrlSyncTimeRange {
    return new NoUrlSyncTimeRange({
        from: new Date(0).toISOString(),
        to: new Date(EndTime).toISOString(),
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
        ],
    });
}

export function createOverlapMetricPanel(
    metricName: string,
    title: string,
    options: OverlapPanelOptions
) : SceneFlexItem {
    const panelWidth = options.width ?? layoutService.getPanelWidth();
    const timeRange = createOverlapTimeRange();
    
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
    panelBuilder.setOption('xField', 'Time');   
    panelBuilder.setOverrides((b: any) => {
        b.matchFieldsWithName('Time').overrideUnit('dtdurationms');
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
        height: options.height ?? 300,
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
