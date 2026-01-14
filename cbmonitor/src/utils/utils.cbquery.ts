import { SceneQueryRunner } from "@grafana/scenes";
import { CB_DATASOURCE_REF } from "../constants";

/**
 * Builder class for constructing Couchbase query strings and query runner
 * The class is used to create a query string and a query runner for a given metric name and snapshot id.
 */
export class CBQueryBuilder {
    // Required parameters
    protected snapshotId: string;
    protected metricName: string;
    protected labelFilters: Map<string, string | string[]> = new Map();
    protected extraFields: string[] = ['d.labels.instance']; // Most panels will select the instance label by default


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
 
    // Build the WHERE clause
    protected buildWhereClause(): string {
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
    protected buildSelectClause(): string {
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

        let query = `SELECT ${selectClause} FROM get_metric_for('${this.metricName}', '${this.snapshotId}') AS d UNNEST _timeseries(d,{'ts_ranges':[\${__from}, \${__to}]}) AS t WHERE ${whereClause}`;

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

/**
 * Builder that applies a timeseries transformation (e.g. rate) via a derived subquery.
 * Output schema: t._t as time, t._v0 as value.
 */
export class AggregationQueryBuilder extends CBQueryBuilder {
    private transformFunction: string = 'rate';
    private outerAlias: string = 'd2';
    private innerAlias: string = 'd';
    // Allowlist of supported transformation functions to avoid SQL injection via function name
    private static readonly ALLOWED_TRANSFORMS: Set<string> = new Set([
        'rate',
        'irate',
        'increase'
    ]);

    setTransformFunction(fnName: string): this {
        const normalized = fnName.trim();
        if (!AggregationQueryBuilder.ALLOWED_TRANSFORMS.has(normalized)) {
            throw new Error(`Invalid transform function: ${fnName}`);
        }
        this.transformFunction = normalized;
        return this;
    }


    protected buildSelectClause(): string {
        const alias = this.outerAlias;
        const remappedExtras = this.extraFields.map(f => f.replace(/^d\./, `${alias}.`));
        const fields = [
            't._t AS time',
            `t._v0 AS \`${this.metricName}\``,
            ...remappedExtras,
        ];
        return fields.join(', ');
    }

    protected buildWhereClause(): string {
        const conditions: string[] = [
            'time_range(t._t)'
        ];
        return conditions.join(' AND ');
    }

    private buildInnerWhereClause(): string {
        const innerConds: string[] = [];
        for (const [label, value] of this.labelFilters.entries()) {
            if (Array.isArray(value)) {
                const valueList = value.map(v => `'${v}'`).join(', ');
                innerConds.push(`${this.innerAlias}.labels.\`${label}\` IN [${valueList}]`);
            } else {
                innerConds.push(`${this.innerAlias}.labels.\`${label}\` = '${value}'`);
            }
        }
        return innerConds.length ? ` WHERE ${innerConds.join(' AND ')}` : '';
    }

    build(): string {
        const selectClause = this.buildSelectClause();
        const whereClause = this.buildWhereClause();
        const innerWhere = this.buildInnerWhereClause();
        const query = `SELECT ${selectClause} FROM ( SELECT RAW OBJECT_PUT(${this.innerAlias}, "ts_data", ${this.transformFunction}(${this.innerAlias}.ts_data, 40)) FROM get_metric_for('${this.metricName}', '${this.snapshotId}') AS ${this.innerAlias}${innerWhere} ) AS ${this.outerAlias} UNNEST _timeseries(${this.outerAlias},{'ts_ranges':[\${__from}, \${__to}]}) AS t WHERE ${whereClause}`;
        return query;
    }
}
