import type { EngagementMetric, MetricUnit } from './catalog.ts';
import type { EngagementQuery } from './query.ts';

export interface EngagementValue {
  /** Decimal strings preserve PostgreSQL bigint values in JSON and CSV. */
  readonly value: string | null;
  readonly reason: string | null;
  readonly unit: MetricUnit;
}
export interface EngagementRow {
  readonly dimension: string;
  readonly values: Readonly<Partial<Record<EngagementMetric, EngagementValue>>>;
}
export interface EngagementReport {
  readonly definitionVersion: number;
  readonly generatedAt: string;
  readonly cutoff: string;
  readonly startedAt: string;
  readonly heartbeatAt: string | null;
  readonly correctionRevision: string;
  readonly coverage: readonly EngagementCoverage[];
  readonly query: EngagementQuery;
  readonly effectiveInterval: { readonly from: string; readonly to: string };
  readonly resolutionSeconds: 60;
  readonly complete: boolean;
  readonly caveats: readonly string[];
  readonly unavailable: Readonly<Partial<Record<EngagementMetric, string>>>;
  readonly rows: readonly EngagementRow[];
  readonly next: string | null;
}

export interface EngagementSnapshot {
  readonly cutoff: string;
  readonly period: 'day' | 'week' | 'month';
  readonly metric: EngagementMetric;
  readonly scope: 'project' | 'community';
  readonly entity: string;
  readonly value: string;
  readonly complete: boolean;
  readonly revision: string;
}

export interface EngagementCoverage {
  readonly reason:
    'collection_failure' | 'maintenance_gap' | 'snapshot_failure';
  readonly from: string;
  readonly to: string;
  readonly occurrences: string;
}

export interface EngagementSnapshotPage {
  readonly rows: readonly EngagementSnapshot[];
  readonly next: string | null;
  readonly asOf: string;
  readonly correctionRevision: string;
  readonly snapshotGeneration: string;
}
