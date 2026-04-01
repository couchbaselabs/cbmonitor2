import { PanelBuilders, SceneFlexItem, SceneQueryRunner, SceneTimeRange } from "@grafana/scenes";
import { FieldType } from "@grafana/data";
import { getNewTimeSeriesDataTransformer, hasDataValues } from "./utils.panel";
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

export function createOverlapMetricPanel(
    metricName: string,
    title: string,
    options: OverlapPanelOptions,
    globalTimeRange: SceneTimeRange
) : SceneFlexItem {
    const panelWidth = options.width ?? layoutService.getPanelWidth();
    
    const panelBuilder = PanelBuilders.timeseries().setTitle(title);
    panelBuilder.setOption('tooltip', { mode: TooltipDisplayMode.Multi });
    panelBuilder.setOption('legend', {
        showLegend: true,
        placement: 'bottom',
        displayMode: LegendDisplayMode.List,
        sortBy: 'Name',
        sortDesc: false,
    });

    panelBuilder.setOverrides((b) => {
        b.matchFieldsByType(FieldType.time).overrideUnit('dtdurations');
    }  )

    const queryRunner = new SceneQueryRunner({
                $timeRange: globalTimeRange,
                datasource: EVIL_PROM_DATASOURCE_REF,
                queries: [{
                    refId: metricName,
                    expr: options.expr,
                }],
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
    const dataTransformer = getNewTimeSeriesDataTransformer(queryRunner);

    const localDisplayTimeRange = new NoUrlSyncTimeRange({
        from: new Date(0).toISOString(),
        to: new Date(EndTime *1000).toISOString(),
        timeZone: 'utc',
    })
    // Generate unique panel ID
    const panelId = `panel-${metricName}-${++panelIdCounter}`;

    // Check if we should hide this panel when empty
    const shouldHideWhenEmpty = layoutService.getHideEmptyPanels();
    const flexItem = new SceneFlexItem({
        key: panelId,
        $timeRange: localDisplayTimeRange,
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
