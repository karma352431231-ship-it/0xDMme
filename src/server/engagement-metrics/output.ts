import type { EngagementReport } from '../../shared/engagement-metrics/index.ts';

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function engagementCsv(report: EngagementReport): string {
  const header = [
    'dimension',
    'metric',
    'value',
    'unit',
    'reason',
    'cutoff',
    'from',
    'to',
    'effective_from',
    'effective_to',
    'collection_start',
    'definition_version',
    'complete',
    'timezone',
    'resolution_seconds',
    'maintenance_heartbeat',
    'caveats',
  ];
  const lines = [header.map(quote).join(',')];
  for (const row of report.rows)
    for (const metric of report.query.metrics) {
      const result = row.values[metric]!;
      lines.push(
        [
          row.dimension,
          metric,
          result.value ?? '',
          result.unit,
          result.reason ?? '',
          report.cutoff,
          report.query.from,
          report.query.to,
          report.effectiveInterval.from,
          report.effectiveInterval.to,
          report.startedAt,
          String(report.definitionVersion),
          String(report.complete),
          report.query.timezone,
          String(report.resolutionSeconds),
          report.heartbeatAt ?? '',
          report.caveats.join(' '),
        ]
          .map(quote)
          .join(','),
      );
    }
  return lines.join('\r\n') + '\r\n';
}

export function engagementTable(report: EngagementReport): string {
  const lines = [
    `Cutoff: ${report.cutoff} | Timezone: ${report.query.timezone} | Complete: ${String(report.complete)}`,
    `Requested: [${report.query.from}, ${report.query.to})`,
    `Effective additive interval: [${report.effectiveInterval.from}, ${report.effectiveInterval.to})`,
    `Collection started: ${report.startedAt} | Definition: ${report.definitionVersion}`,
    'Dimension | Metric | Value | Unit | Limitation',
  ];
  for (const row of report.rows)
    for (const metric of report.query.metrics) {
      const result = row.values[metric]!;
      lines.push(
        [
          row.dimension,
          metric,
          result.value ?? 'unavailable',
          result.unit,
          result.reason ?? '',
        ].join(' | '),
      );
    }
  lines.push(...report.caveats.map((note) => `Note: ${note}`));
  lines.push(
    ...Object.entries(report.unavailable).map(
      ([metric, reason]) => `${metric}: unavailable (${reason})`,
    ),
  );
  if (report.next) lines.push(`Next cursor: ${report.next}`);
  return lines.join('\n') + '\n';
}
