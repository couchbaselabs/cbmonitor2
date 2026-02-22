import { SceneQueryRunner } from "@grafana/scenes";
import { PROM_DATASOURCE_REF } from "../constants";

/**
 * Extract the plain label name from a Couchbase extra-field expression.
 * Handles formats like:
 *   d.labels.instance        → instance
 *   d.labels.`bucket`        → bucket
 *   d2.labels.`connection_type` → connection_type
 */
function extractLabelName(field: string): string | undefined {
    const matchBackticks = field.match(/\.labels\.\`([^`]+)\`/);
    if (matchBackticks) {
        return matchBackticks[1];
    }
    const matchDot = field.match(/\.labels\.([^`.]+)/);
    return matchDot ? matchDot[1] : undefined;
}

/**
 * PromQL query builder that mirrors the CBQueryBuilder API.
 *
 * Instead of SQL++, it emits PromQL expressions targeting a Prometheus datasource.
 * The same constructor signature and fluent methods (addLabelFilter, setExtraFields,
 * buildQueryRunner) are used so that utils.panel.ts can treat both builders identically.
 */
export class PromQueryBuilder {
    protected snapshotId: string;
    protected metricName: string;
    protected labelFilters: Map<string, string | string[]> = new Map();
    protected extraFields: string[] = ['d.labels.instance'];

    constructor(snapshotId: string, metricName: string) {
        this.snapshotId = snapshotId;
        this.metricName = metricName;
    }

    addLabelFilter(label: string, value: string | string[]): this {
        this.labelFilters.set(label, value);
        return this;
    }

    setExtraFields(fields: string[]): this {
        this.extraFields = fields;
        return this;
    }

    addExtraField(field: string): this {
        if (!this.extraFields.includes(field)) {
            this.extraFields.push(field);
        }
        return this;
    }

    /**
     * Build PromQL label matchers string, e.g. {job="abc",proc="memcached"}
     */
    protected buildLabelMatchers(): string {
        const matchers: string[] = [
            `job="${this.snapshotId}"`,
        ];

        for (const [label, value] of this.labelFilters.entries()) {
            if (Array.isArray(value)) {
                // PromQL regex match for multiple values
                matchers.push(`${label}=~"${value.join('|')}"`);
            } else {
                matchers.push(`${label}="${value}"`);
            }
        }

        return matchers.join(',');
    }

    /**
     * Build the PromQL expression string.
     */
    build(): string {
        const matchers = this.buildLabelMatchers();
        return `${this.metricName}{${matchers}}`;
    }

    /**
     * Build legend format string from extraFields, matching the CBQueryBuilder legend convention.
     * E.g. extraFields ['d.labels.instance', 'd.labels.`bucket`'] → '{{instance}} , {{bucket}}'
     */
    protected buildLegendFormat(): string {
        const labelNames = this.extraFields
            .map(extractLabelName)
            .filter((n): n is string => Boolean(n));

        if (labelNames.length > 0) {
            return labelNames.map((n) => `{{${n}}}`).join(' , ');
        }
        return '{{instance}}';
    }

    buildQueryRunner(): SceneQueryRunner {
        if (process.env.NODE_ENV === 'development') {
            console.debug(`[PromQueryBuilder] Building runner for metric=${this.metricName}, snapshotId=${this.snapshotId}`);
        }
        return new SceneQueryRunner({
            datasource: PROM_DATASOURCE_REF,
            queries: [{
                refId: this.metricName,
                expr: this.build(),
                legendFormat: this.buildLegendFormat(),
            }],
        });
    }
}

/**
 * PromQL aggregation builder — applies a range-vector function (rate, irate, increase)
 * around the metric selector, mirroring AggregationQueryBuilder for SQL++.
 */
export class PromAggregationQueryBuilder extends PromQueryBuilder {
    private transformFunction = 'rate';
    private rangeInterval = '$__rate_interval';

    private static readonly ALLOWED_TRANSFORMS: Set<string> = new Set([
        'rate',
        'irate',
        'increase',
    ]);

    setTransformFunction(fnName: string): this {
        const normalized = fnName.trim();
        if (!PromAggregationQueryBuilder.ALLOWED_TRANSFORMS.has(normalized)) {
            throw new Error(`Invalid transform function: ${fnName}`);
        }
        this.transformFunction = normalized;
        return this;
    }

    setRangeInterval(interval: string): this {
        this.rangeInterval = interval;
        return this;
    }

    build(): string {
        const matchers = this.buildLabelMatchers();
        return `${this.transformFunction}(${this.metricName}{${matchers}}[${this.rangeInterval}])`;
    }
}
