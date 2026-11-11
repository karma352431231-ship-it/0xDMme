import { bootMilestones } from '../../shared/chat-sync-diagnostics/boot.ts';
import {
  loadKinds,
  loadStages,
} from '../../shared/chat-sync-diagnostics/load.ts';
import type {
  LoadKind,
  LoadStage,
} from '../../shared/chat-sync-diagnostics/load.ts';
import type { TraceEvent } from './events.ts';

interface StageTiming {
  atMs: number;
  durationMs: number | null;
  count: number;
}
function stageTiming(
  previous: StageTiming | undefined,
  event: TraceEvent,
  elapsedMs: number,
): StageTiming {
  const duration =
    typeof event['loadStageMs'] === 'number' ? event['loadStageMs'] : null;
  return {
    atMs: elapsedMs,
    count: (previous?.count ?? 0) + 1,
    durationMs:
      duration === null
        ? (previous?.durationMs ?? null)
        : (previous?.durationMs ?? 0) + duration,
  };
}
interface LoadSummary {
  slot: number;
  kind: LoadKind;
  conversation: number;
  startedMs: number;
  elapsedMs: number;
  outcome: string;
  presentation: string;
  longestTaskMs: number;
  bytes: number | null;
  rows: number | null;
  stages: Partial<Record<LoadStage, StageTiming>>;
}
/** Bounded operation summaries outlive detailed timeline eviction. */
export class ComparisonLoads {
  private readonly loads = new Map<number, LoadSummary>();
  private overflow = 0;
  private native = false;
  private coverage = false;
  private early = false;
  private earlyLongTasks = false;
  private earlyDropped = 0;
  private readonly boot: Record<string, number | boolean> = {};
  observe(event: TraceEvent): void {
    if (event.kind === 'reuse-ready') {
      this.native = event['nativeTimings'] === true;
      this.coverage = event['loadTimings'] === true;
      this.early = event['earlyTimings'] === true;
      this.earlyLongTasks = event['earlyLongTasks'] === true;
      this.earlyDropped = Number(event['earlyDropped']) || 0;
    }
    if (event.kind === 'reuse-boot') this.observeBoot(event);
    if (event.kind === 'long-task') this.longTask(event);
    if (event.kind !== 'reuse-load' || typeof event['load'] !== 'number')
      return;
    const stage = loadStages.find((value) => value === event['loadStage']);
    const kind = loadKinds.find((value) => value === event['loadKind']);
    if (!stage || !kind) return;
    const summary = this.get(event, kind);
    if (!summary) return;
    this.update(summary, event, stage);
  }
  private observeBoot(event: TraceEvent): void {
    const milestone = event['bootMilestone'];
    if (
      typeof milestone !== 'string' ||
      !bootMilestones.some((value) => value === milestone)
    )
      return;
    if (typeof event['bootAvailable'] === 'boolean')
      this.boot[milestone + '/available'] = event['bootAvailable'];
    for (const field of [
      'bootActivityMs',
      'bootWebViewMs',
      'bootDocumentMs',
      'bootNavigationMs',
    ])
      if (typeof event[field] === 'number')
        this.boot[milestone + '/' + field] = event[field];
  }
  private longTask(event: TraceEvent): void {
    for (const load of this.loads.values())
      if (load.outcome === 'incomplete')
        load.longestTaskMs = Math.max(
          load.longestTaskMs,
          Number(event['durationMs']) || 0,
        );
  }
  private update(
    summary: LoadSummary,
    event: TraceEvent,
    stage: LoadStage,
  ): void {
    if (typeof event['loadBytes'] === 'number')
      summary.bytes = event['loadBytes'];
    if (typeof event['loadRows'] === 'number') summary.rows = event['loadRows'];
    summary.elapsedMs = Number(event['loadMs']) || 0;
    summary.stages[stage] = stageTiming(
      summary.stages[stage],
      event,
      summary.elapsedMs,
    );
    if (typeof event['loadPresentation'] === 'string')
      summary.presentation = event['loadPresentation'];
    if (['complete', 'failed', 'cancelled'].includes(stage))
      summary.outcome = String(event['loadOutcome'] ?? stage);
  }
  private get(event: TraceEvent, kind: LoadKind): LoadSummary | undefined {
    const slot = Number(event['load']);
    const found = this.loads.get(slot);
    if (found || event['loadStage'] !== 'start') return found;
    if (this.loads.size >= 64) {
      this.overflow++;
      return;
    }
    const summary: LoadSummary = {
      slot,
      kind,
      conversation: Number(event['conversation']) || 0,
      startedMs: event.ms - (Number(event['loadMs']) || 0),
      elapsedMs: 0,
      outcome: 'incomplete',
      presentation: 'unavailable',
      longestTaskMs: 0,
      bytes: null,
      rows: null,
      stages: {},
    };
    this.loads.set(slot, summary);
    return summary;
  }
  report() {
    return {
      limit: 64,
      overflow: this.overflow,
      internalStagesAvailable: this.coverage,
      nativeTransportAvailable: this.native,
      clock: 'one-client-monotonic; no-sender-to-recipient-clock-comparison',
      presentation:
        'DOM-frame-opportunity or native-draw/video-frame; not-physical-screen-proof',
      startup: {
        earlyCaptureAvailable: this.early,
        earlyLongTasksAvailable: this.earlyLongTasks,
        droppedEarlyEvents: this.earlyDropped,
        native: { ...this.boot },
        timing:
          'document-relative JavaScript; Android activity-relative milestones include bridge notification delay; no time before Activity.onCreate',
        timeline: 'negative ms precedes Mac console installation',
      },
      operations: structuredClone([...this.loads.values()]),
    };
  }
}
