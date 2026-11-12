import type { TraceEvent } from './events.ts';
/** Separate bounded summaries survive eviction of the detailed network log. */
export class FlowSummaries {
  private readonly reads = new Map<number, TraceEvent[]>();
  private readonly work = new Map<number, TraceEvent[]>();
  private overflow = false;
  observe(event: TraceEvent): void {
    if (event['flowOverflow'] === true) this.overflow = true;
    if (event.kind === 'reuse-handle-read')
      this.add(this.reads, 'handleRead', event, 128);
    if (event.kind === 'reuse-authority-work')
      this.add(this.work, 'diagnosticWork', event, 512);
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
    if (points.length >= 8) {
      this.overflow = true;
      return;
    }
    points.push(event);
    rows.set(slot, points);
  }
  report() {
    return {
      overflow: this.overflow,
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
