import { SceneFlexItem } from '@grafana/scenes';

/**
 * Declarative spec for a single panel. Both modes accept the same shape.
 *
 * `labelFilters`, `extraFields`, `transformFunction` are SQL++ forwarding
 * concerns consumed only by the single-mode `ctx.panel` (which routes to
 * `createMetricPanel`). The overlap-mode `ctx.panel` is PromQL-only and
 * silently ignores them.
 */
export interface PanelSpec {
    expr: string;
    legendFormat?: string;
    unit?: string;
    width?: string | number;
    height?: number;

    labelFilters?: Record<string, string | string[]>;
    extraFields?: string[];
    transformFunction?: string;
}

/**
 * Which pass of the builder is currently executing.
 * - 'base'        — emitted always; the only branch used in overlap mode.
 * - 'perInstance' — single-mode only; emitted once per discovered instance
 *                   (deep-dive panels with extra label breakdowns). Overlap
 *                   re-uses 'base' and varies its output via `instanceFilter`
 *                   / `sumBy` instead.
 * - 'fallback'    — single-mode only; emitted once when no instances are
 *                   discovered.
 */
export type BuilderBranch = 'base' | 'perInstance' | 'fallback';

/**
 * Context injected by the scene drivers. Closes over mode-specific
 * concerns (factory, datasource, time range, transformer) so each
 * per-service builder stays mode-agnostic.
 */
export interface MetricContext {
    mode: 'single' | 'overlap';
    branch: BuilderBranch;

    // PromQL building primitives. Compose into template literals; never
    // post-process expressions with regex/string-replace.
    jobSelector: string;     // 'job="abc"' | 'job=~"a|b"'
    instanceFilter: string;  // '' | ', instance="i"'
    titleSuffix: string;     // '' (single, both branches) | '' or ' - i' (overlap)
    perInstance?: string;    // populated when emitting per-instance panels

    sumBy(...extraDims: string[]): string;     // single: 'instance[, …]'; overlap: 'job[, instance][, …]'
    legend(...labels: string[]): string;       // single: '{{instance}} , {{l}}…'; overlap: '{{job}}, {{instance}}, {{l}}…'

    // Build a panel; closes over mode-specific factory + per-mode wiring.
    panel(metricName: string, title: string, spec: PanelSpec): SceneFlexItem;

    // Conditionally include items only in the named modes. Preserves
    // intentional per-mode panel-set divergence (e.g. a panel that lives
    // only in single, or only in overlap).
    modeOnly<T>(modes: ReadonlyArray<'single' | 'overlap'>, items: T[]): T[];
}

/**
 * A per-service panel emitter. Invoked multiple times by the scene driver
 * — for single mode once per branch (base, perInstance × N, fallback);
 * for overlap mode once per instance (or once with no instance) — and
 * returns the panels for that pass.
 */
export type ServiceBuilder = (ctx: MetricContext) => SceneFlexItem[];
