import type { TraceEvent } from './events.ts';
interface Category {
  requests: number;
  completed: number;
  failed: number;
  cancelled: number;
  bytes: number;
  totalMs: number;
  longestMs: number;
  statuses: Record<string, number>;
}
/** Aggregate native requests survive detail eviction without retaining paths/IDs. */
export class NativeRequestSummaries {
  private readonly active = new Map<number, string>();
  private readonly categories = new Map<string, Category>();
  private overflow = 0;
  observe(event: TraceEvent): void {
    if (
      event.kind !== 'reuse-native-request' ||
      typeof event['nativeRequest'] !== 'number' ||
      typeof event['nativeCategory'] !== 'string'
    )
      return;
    const id = event['nativeRequest'],
      category = event['nativeCategory'];
    if (event['nativePhase'] === 'start') {
      this.start(id, category);
      return;
    }
    if (this.active.get(id) !== category) return;
    const summary = this.categories.get(category)!;
    if (event['nativePhase'] === 'headers') {
      const status = String(event['nativeStatus']);
      summary.statuses[status] = (summary.statuses[status] ?? 0) + 1;
      return;
    }
    this.finish(event, summary, id);
  }
  private start(id: number, category: string): void {
    if (
      this.active.size >= 128 ||
      (!this.categories.has(category) && this.categories.size >= 64)
    ) {
      this.overflow++;
      return;
    }
    const summary = this.categories.get(category) ?? {
      requests: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      bytes: 0,
      totalMs: 0,
      longestMs: 0,
      statuses: {},
    };
    summary.requests++;
    this.categories.set(category, summary);
    this.active.set(id, category);
  }
  private finish(event: TraceEvent, summary: Category, id: number): void {
    const phase = event['nativePhase'];
    if (!['body', 'failed', 'cancelled'].includes(String(phase))) return;
    if (phase === 'body') summary.completed++;
    else if (phase === 'failed') summary.failed++;
    else summary.cancelled++;
    summary.bytes += Number(event['nativeBytes']) || 0;
    const ms = Number(event['nativeMs']) || 0;
    summary.totalMs += ms;
    summary.longestMs = Math.max(summary.longestMs, ms);
    this.active.delete(id);
  }
  report() {
    return {
      overflow: this.overflow,
      pending: this.active.size,
      timing: 'native-bridge-and-demand-driven-body; includes-caller-read-wait',
      categories: structuredClone(Object.fromEntries(this.categories)),
    };
  }
}
