import {
  handleDeliveryStages,
  handlePairCode,
} from '../../shared/chat-sync-diagnostics/handle.ts';
import type { HandleDeliveryStage } from '../../shared/chat-sync-diagnostics/handle.ts';
import type { TraceEvent } from './events.ts';

interface DeliverySummary {
  slot: number;
  tag: string | null;
  stages: Partial<Record<HandleDeliveryStage, number>>;
}

/** Keep message milestones independently of the rolling network timeline. */
export class ComparisonHandleDelivery {
  private readonly messages = new Map<number, DeliverySummary>();
  private readonly refreshes: TraceEvent[] = [];
  private droppedRefreshes = 0;
  private available = false;
  private paired = false;
  private pairUnavailable = false;
  private overflow = false;

  observe(event: TraceEvent): void {
    if (event.kind === 'reuse-ready')
      this.available = event['handleTimings'] === true;
    if (event.kind === 'reuse-handle-refresh') this.refresh(event);
    if (event.kind !== 'reuse-handle-delivery') return;
    const stage = handleDeliveryStages.find(
      (value) => value === event['handleStage'],
    );
    switch (stage) {
      case 'paired':
        this.paired = true;
        return;
      case 'pair-unavailable':
        this.pairUnavailable = true;
        return;
      case 'overflow':
        this.overflow = true;
        return;
      case undefined:
        return;
      default:
        this.message(event, stage);
    }
  }

  private refresh(event: TraceEvent): void {
    if (this.refreshes.length === 64) {
      this.refreshes.shift();
      this.droppedRefreshes++;
    }
    this.refreshes.push(event);
  }

  private message(event: TraceEvent, stage: HandleDeliveryStage): void {
    const slot = event['message'];
    if (typeof slot !== 'number' || slot < 1 || slot > 128) return;
    const row = this.messages.get(slot) ?? { slot, tag: null, stages: {} };
    if (stage === 'linked') {
      const tag = event['handleTag'];
      if (handlePairCode(tag)) row.tag = tag;
    } else row.stages[stage] ??= event.ms;
    this.messages.set(slot, row);
  }

  report() {
    return {
      available: this.available,
      paired: this.paired,
      pairUnavailable: this.pairUnavailable,
      overflow: this.overflow,
      droppedRefreshes: this.droppedRefreshes,
      refreshes: this.refreshes.map((event) => ({ ...event })),
      messages: [...this.messages.values()].map((row) => ({
        ...row,
        stages: { ...row.stages },
      })),
    };
  }
}
