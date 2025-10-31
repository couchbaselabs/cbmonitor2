import { SceneQueryRunner } from "@grafana/scenes";
import { CB_DATASOURCE_REF } from "../constants";

/**
 * Builder class for constructing Couchbase query strings and query runner
 * The class is used to create a query string and a query runner for a given metric name and snapshot id.
 */
export class CBQueryBuilder {
    // Required parameters
    private snapshotId: string;
    private metricName: string;
    private labelFilters: Map<string, string | string[]> = new Map();
    private extraFields: string[] = ['d.labels.instance']; // Most panels will select the instance label by default
    private timeRange: { from: string; to: string } = { from: '${__from}', to: '${__to}' };

    constructor(snapshotId: string, metricName: string) {
        this.snapshotId = snapshotId;
        this.metricName = metricName;
    }

    // Add label filters
    addLabelFilter(label: string, value: string | string[]): this {
        this.labelFilters.set(label, value);
        return this;
    }

    // Set which extra fields to fetch
    setExtraFields(fields: string[]): this {
        this.extraFields = fields;
        return this;
    }


    /* The default WHERE clause is the time_range(t._t) which is expanded by the datasource
    * to include the time range variables $__from and $__to.
    *
    * For panels that need to filter on specific labels, use the addLabelFilter method.
    */
    addExtraField(field: string): this {
        if (!this.extraFields.includes(field)) {
            this.extraFields.push(field);
        }
        return this;
    }

    // Set time range
    setTimeRange(from: string, to: string): this {
        this.timeRange = { from, to };
        return this;
    }

    // Build the WHERE clause
    private buildWhereClause(): string {
        const conditions: string[] = [
            `time_range(t._t)`,
        ];

        // Add label filters
        for (const [label, value] of this.labelFilters.entries()) {
            if (Array.isArray(value)) {
                const valueList = value.map(v => `'${v}'`).join(', ');
                conditions.push(`d.labels.\`${label}\` IN [${valueList}]`);
            } else {
                conditions.push(`d.labels.\`${label}\` = '${value}'`);
            }
        }

        return conditions.join(' AND ');
    }

    // Build the SELECT clause
    private buildSelectClause(): string {
        const fields = [
            'MILLIS_TO_STR(t._t) AS time',
            `t._v0 AS \`${this.metricName}\``, // Use metric name as the label for the metric value so it can be displayed in the legend
            ...this.extraFields
        ];
        return fields.join(', ');
    }

    // Build the complete query string using the select and where clauses
    build(): string {
        const selectClause = this.buildSelectClause();
        const whereClause = this.buildWhereClause();

        let query = `SELECT ${selectClause} FROM get_metric_for('${this.metricName}', '${this.snapshotId}') AS d UNNEST _timeseries(d,{'ts_ranges':[${this.timeRange.from},${this.timeRange.to}]}) AS t WHERE ${whereClause}`;

        return query;
    }

    // Build and return a SceneQueryRunner
    buildQueryRunner(): SceneQueryRunner {
        return new SceneQueryRunner({
            datasource: CB_DATASOURCE_REF,
            queries: [{
                refId: this.metricName,
                query: this.build(),
            }],
        });
    }
}
