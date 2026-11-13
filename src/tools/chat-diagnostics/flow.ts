import type { TraceEvent } from './events.ts';
import { handleListCallers } from '../../shared/chat-sync-diagnostics/flow.ts';
export interface AuthorityWorkSummary {
  slot: number;
  events: TraceEvent[];
}
/** Separate bounded summaries survive eviction of the detailed network log. */
export class FlowSummaries {
  private readonly reads = new Map<number, TraceEvent[]>();
  private readonly work = new Map<number, TraceEvent[]>();
  private readonly sends = new Map<number, TraceEvent[]>();
  private readonly lists = new Map<
    string,
    { requests: number; shared: number }
  >();
  private preparationAvailable = false;
  private overflow = false;
  observe(event: TraceEvent): void {
    if (event.kind === 'reuse-ready')
      this.preparationAvailable = event['sendPreparationTimings'] === true;
    if (event['flowOverflow'] === true) this.overflow = true;
    if (event.kind === 'reuse-handle-read')
      this.add(this.reads, 'handleRead', event, 128);
    if (event.kind === 'reuse-authority-work')
      this.add(this.work, 'diagnosticWork', event, 512);
    if (
      ['reuse-handle-send', 'reuse-send'].includes(event.kind) &&
      event['handleSend']
    )
      this.add(this.sends, 'handleSend', event, 128);
    if (event.kind === 'reuse-handle-list') this.list(event);
  }
  private list(event: TraceEvent): void {
    const caller = String(event['handleListCaller']);
    if (!handleListCallers.some((known) => known === caller)) return;
    const counts = this.lists.get(caller) ?? { requests: 0, shared: 0 };
    counts.requests++;
    if (event['listShared'] === true) counts.shared++;
    this.lists.set(caller, counts);
  }
  private add(
    rows: Map<number, TraceEvent[]>,
    key: string,
    event: TraceEvent,
    limit: number,
  ): void {
    const slot = event[key];
    if (typeof slot !== 'number') return;
    if (!rows.has(slot) && rows.size >= limit) {
      this.overflow = true;
      return;
    }
    const points = rows.get(slot) ?? [];
    if (points.length >= (key === 'handleSend' ? 32 : 8)) {
      this.overflow = true;
      return;
    }
    points.push(event);
    rows.set(slot, points);
  }
  get senderPreparationAvailable(): boolean {
    return this.preparationAvailable;
  }
  report() {
    return {
      overflow: this.overflow,
      senderPreparationAvailable: this.senderPreparationAvailable,
      sends: [...this.sends].map(([slot, events]) => ({
        slot,
        events: events.map((e) => ({ ...e })),
      })),
      listReads: [...this.lists].map(([caller, counts]) => ({
        caller,
        ...counts,
      })),
      reads: [...this.reads].map(([slot, events]) => ({
        slot,
        events: events.map((e) => ({ ...e })),
      })),
      authority: [...this.work].map(([slot, events]) => ({
        slot,
        events: events.map((e) => ({ ...e })),
      })),
    };
  }
}
