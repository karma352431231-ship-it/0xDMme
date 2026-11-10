import { ComparisonSends } from './sends.ts';
import type { SendCase } from './sends.ts';
import type { TraceEvent, RecordEvent } from './events.ts';
export type { TraceEvent, RecordEvent } from './events.ts';

/** Only callers with fixed labels and numerical measurements belong here.
 * No payloads, errors, identity, DOM text or arbitrary user annotations. */
export class Recording {
  private readonly started = performance.now();
  private readonly events: TraceEvent[] = [];
  private dropped = 0;
  private ended: number | null = null;
  private readonly sends = new ComparisonSends();
  readonly record: RecordEvent = (kind, data = {}) => {
    if (this.ended !== null) return;
    if (this.events.length === 1500) {
      this.events.shift();
      this.dropped++;
    }
    const event = { ...data, ms: this.elapsed(), kind };
    this.sends.observe(event);
    this.events.push(event);
  };
  beginSend(label: SendCase): number | null {
    if (this.ended !== null) return null;
    const slot = this.sends.begin(label, this.elapsed());
    this.record('send-case', { label, slot: slot ?? 0 });
    return slot;
  }
  elapsed(): number {
    return Math.round((this.ended ?? performance.now()) - this.started);
  }
  stop(): void {
    this.record('capture-stopped');
    this.ended ??= performance.now();
  }
  report() {
    return {
      schema: 2,
      active: this.ended === null,
      elapsedMs: this.elapsed(),
      droppedEvents: this.dropped,
      limits: { events: 1500, durationMs: 600_000 },
      coverage: {
        requestsAndLocks: 'started-after-installation-in-this-tab',
        stream: 'complete-empty-control-frames-only; route-unverified',
        submissions:
          'enter-click-submit-and-controls; not-delivery-or-read-proof',
        causality: 'timeline-and-caller-positions; not-an-automatic-diagnosis',
        conversationSlots:
          'anonymous-DOM-rows; replacement-may-assign-a-new-slot',
        wakeups: 'local-controls-cross-tab-device-and-service-worker-hints',
        reuse:
          'availability-in-reuse-coverage; internal-decisions-since-installation-only; no-earlier-eviction-history',
        groupDelivery:
          'own-text-steps-by-per-capture-message-slot; recipient-hint-and-first-shown-rows; no-cross-tab-or-device-correlation',
      },
      events: this.events.map((event) => ({ ...event })),
      comparison: this.sends.report(),
    };
  }
}

/** Exclude function names, origins, arbitrary paths and exception messages. */
export function callerPositions(): string[] {
  const stack = new Error().stack ?? '';
  return [...stack.matchAll(/\b(app-[a-f0-9]{16}\.js):(\d+):(\d+)/gu)]
    .slice(0, 6)
    .map((match) => `${match[1]}:${match[2]}:${match[3]}`);
}

export function failureCategory(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'aborted';
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  return 'failed';
}
