import {
  handleDeliveryStages,
  handlePairCode,
} from '../../shared/chat-sync-diagnostics/handle.ts';
import type { HandleDeliveryStage } from '../../shared/chat-sync-diagnostics/handle.ts';
import type { TraceEvent } from './events.ts';

interface DeliverySummary {
  slot: number;
  read?: number;
  senderMessage?: number;
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
  private revision = 0;
  private fingerprint: string | null = null;
  private pairUnavailable = false;
  private overflow = false;

  observe(event: TraceEvent): void {
    if (event.kind === 'reuse-ready') {
      this.available = event['handleTimings'] === true;
      this.revision = Number(event['handleRevision']) || 0;
    }
    if (event.kind === 'reuse-handle-refresh') this.refresh(event);
    if (event.kind !== 'reuse-handle-delivery') return;
    const stage = handleDeliveryStages.find(
      (value) => value === event['handleStage'],
    );
    switch (stage) {
      case 'paired':
        this.paired = true;
        this.fingerprint =
          typeof event['handlePairFingerprint'] === 'string'
            ? event['handlePairFingerprint']
            : null;
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
    const row: DeliverySummary = this.messages.get(slot) ?? {
      slot,
      tag: null,
      stages: {},
    };
    if (stage === 'linked') {
      const tag = event['handleTag'];
      if (handlePairCode(tag)) row.tag = tag;
    } else row.stages[stage] ??= event.ms;
    if (typeof event['handleRead'] === 'number') row.read = event['handleRead'];
    if (typeof event['senderMessage'] === 'number')
      row.senderMessage = event['senderMessage'];
    this.messages.set(slot, row);
  }

  state() {
    return {
      available: this.available,
      revision: this.revision,
      compatible: this.revision === 2,
      pairFingerprint: this.fingerprint,
      hintAttribution: 'account-wide-candidate; not-proof-of-message-causality',
      firstDisplay: 'visible-DOM-frame-opportunity; not-physical-paint',
      paired: this.paired,
      pairUnavailable: this.pairUnavailable,
    };
  }

  report(
    sends: readonly {
      message: number | null;
      submitMs: number | null;
      ambiguous: boolean;
    }[] = [],
  ) {
    return {
      ...this.state(),
      overflow: this.overflow,
      droppedRefreshes: this.droppedRefreshes,
      refreshes: this.refreshes.map((event) => ({ ...event })),
      messages: [...this.messages.values()].map((row) => ({
        ...row,
        clickMs:
          sends.find(
            (send) => send.message === row.senderMessage && !send.ambiguous,
          )?.submitMs ?? null,
        stages: { ...row.stages },
      })),
    };
  }
}
