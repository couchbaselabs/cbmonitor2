import { SceneFlexItem } from '@grafana/scenes';
import type { CustomPanelOverride, CustomPanelsConfig } from '../types/snapshot';
import type { MetricContext, ServiceBuilder } from './types';
import { getCachedCustomMetricNames } from '../services/customMetricsDiscovery';

/**
 * Build a `ServiceBuilder` for the snapshot's optional "Custom" tab.
 *
 * The list of metric names is resolved once by the viewer page (via the
 * metric-names discovery endpoint) and read from the in-memory cache
 * here so the builder stays synchronous like every other service
 * builder. The builder only emits panels in the `base` branch — the
 * per-instance pass is skipped because we have no service-specific
 * knowledge of what labels matter for arbitrary metrics.
 */
export function makeCustomBuilder(
    snapshotId: string,
    config: CustomPanelsConfig,
): ServiceBuilder {
    const rateRegex = compileRegex(config.rate_match);

    return (ctx: MetricContext): SceneFlexItem[] => {
        if (ctx.branch !== 'base') {
            return [];
        }
        const discovered = getCachedCustomMetricNames(snapshotId, config.match);
        const names = discovered?.names ?? [];
        if (names.length === 0) {
            return [];
        }

        return names.map((name) => buildPanel(ctx, name, rateRegex, config.overrides?.[name]));
    };
}

function buildPanel(
    ctx: MetricContext,
    metric: string,
    rateRegex: RegExp | null,
    override: CustomPanelOverride | undefined,
): SceneFlexItem {
    const shouldRate = override?.transformFunction === 'rate'
        || (override?.transformFunction === undefined && metricLooksLikeCounter(metric, rateRegex));

    const inner = `${metric}{${ctx.jobSelector}${ctx.instanceFilter}}`;
    const series = shouldRate ? `rate(${inner}[$__rate_interval])` : inner;
    const expr = `sum by (${ctx.sumBy()}) (${series})`;

    const title = `${override?.title ?? metric}${ctx.titleSuffix}`;

    return ctx.panel(metric, title, {
        expr,
        legendFormat: override?.legendFormat ?? ctx.legend(),
        ...(override?.unit ? { unit: override.unit } : {}),
    });
}

function metricLooksLikeCounter(metric: string, rateRegex: RegExp | null): boolean {
    if (rateRegex && rateRegex.test(metric)) {
        return true;
    }
    return metric.endsWith('_total');
}

function compileRegex(pattern: string | undefined): RegExp | null {
    if (!pattern) {
        return null;
    }
    try {
        return new RegExp(pattern);
    } catch (err) {
        console.warn(`custom_panels.rate_match is not a valid regex: ${pattern}`, err);
        return null;
    }
}
