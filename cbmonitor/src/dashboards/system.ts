import type { ServiceBuilder } from './types';

/**
 * Unified panel emitter for the System service. Drives both the
 * single-snapshot dashboard (5 aggregated base panels + 2 per-instance
 * disk panels per discovered instance, with an aggregated fallback when
 * no instances are reported) and the overlap dashboard (7 panels per
 * instance group, with `{{job}}` prefix on legends).
 *
 * Mode divergences are expressed inline:
 * - The two disk rate panels appear in `branch:'base'` only when running
 *   in overlap mode (`ctx.modeOnly(['overlap'], …)`); in single mode they
 *   live in the dedicated per-instance / fallback branches because the
 *   per-instance variants want a `{{disk}}` breakdown that the overlap
 *   variant deliberately omits.
 */
export const systemBuilder: ServiceBuilder = (ctx) => {
    if (ctx.branch === 'base') {
        return [
            ctx.panel('sys_cpu_utilization_rate', `CPU Utilization (%)${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy()}) (sys_cpu_utilization_rate{${ctx.jobSelector}${ctx.instanceFilter}})`,
                legendFormat: ctx.legend(),
                unit: 'percent',
                width: '100%',
            }),
            ctx.panel('sys_mem_free_sys', `Free Memory (Bytes)${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy()}) (sys_mem_free_sys{${ctx.jobSelector}${ctx.instanceFilter}})`,
                legendFormat: ctx.legend(),
                unit: 'bytes',
            }),
            ctx.panel('sys_mem_used_sys', `Used Memory (Bytes)${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy()}) (sys_mem_used_sys{${ctx.jobSelector}${ctx.instanceFilter}})`,
                legendFormat: ctx.legend(),
                unit: 'bytes',
            }),
            ctx.panel('sys_disk_queue', `Disk Queue (Aggregate)${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy()}) (sys_disk_queue{${ctx.jobSelector}${ctx.instanceFilter}})`,
                legendFormat: ctx.legend(),
                unit: 'short',
            }),
            ctx.panel('couch_docs_actual_disk_size', `Couch Docs Actual Disk Size (Bytes)${ctx.titleSuffix}`, {
                expr: `sum by (${ctx.sumBy('bucket')}) (couch_docs_actual_disk_size{${ctx.jobSelector}${ctx.instanceFilter}})`,
                legendFormat: ctx.legend('bucket'),
                extraFields: ['d.labels.`instance`', 'd.labels.`bucket`'],
                unit: 'bytes',
            }),
            // Disk read/write: overlap renders them aggregated in 'base';
            // single mode emits richer per-instance variants in the
            // 'perInstance' branch (and a stripped fallback) below.
            ...ctx.modeOnly(['overlap'], [
                ctx.panel('sys_disk_read_bytes', `Rate Disk Read Bytes${ctx.titleSuffix}`, {
                    expr: `sum by (${ctx.sumBy()}) (rate(sys_disk_read_bytes{${ctx.jobSelector}${ctx.instanceFilter}}[$__rate_interval]))`,
                    legendFormat: ctx.legend(),
                    unit: 'Bps',
                }),
                ctx.panel('sys_disk_write_bytes', `Rate Disk Write Bytes${ctx.titleSuffix}`, {
                    expr: `sum by (${ctx.sumBy()}) (rate(sys_disk_write_bytes{${ctx.jobSelector}${ctx.instanceFilter}}[$__rate_interval]))`,
                    legendFormat: ctx.legend(),
                    unit: 'Bps',
                }),
            ]),
        ];
    }

    if (ctx.branch === 'perInstance') {
        const i = ctx.perInstance!;
        return [
            ctx.panel('sys_disk_read_bytes', `Rate Disk Read Bytes (${i})`, {
                expr: `rate(sys_disk_read_bytes{${ctx.jobSelector},instance="${i}"}[$__rate_interval])`,
                legendFormat: '{{disk}}',
                labelFilters: { instance: i },
                extraFields: ['d.labels.`disk`'],
                transformFunction: 'rate',
                unit: 'Bps',
            }),
            ctx.panel('sys_disk_write_bytes', `Rate Disk Write Bytes (${i})`, {
                expr: `rate(sys_disk_write_bytes{${ctx.jobSelector},instance="${i}"}[$__rate_interval])`,
                legendFormat: '{{disk}}',
                labelFilters: { instance: i },
                extraFields: ['d.labels.`disk`'],
                transformFunction: 'rate',
                unit: 'Bps',
            }),
        ];
    }

    // branch === 'fallback' (single mode only — no instances discovered).
    return [
        ctx.panel('sys_disk_read_bytes', 'Rate Disk Read Bytes', {
            expr: `rate(sys_disk_read_bytes{${ctx.jobSelector}}[$__rate_interval])`,
            legendFormat: '{{disk}}',
            extraFields: ['d.labels.`disk`'],
            transformFunction: 'rate',
            unit: 'Bps',
        }),
        ctx.panel('sys_disk_write_bytes', 'Rate Disk Write Bytes', {
            expr: `rate(sys_disk_write_bytes{${ctx.jobSelector}}[$__rate_interval])`,
            legendFormat: '{{disk}}',
            extraFields: ['d.labels.`disk`'],
            transformFunction: 'rate',
            unit: 'Bps',
        }),
    ];
};

