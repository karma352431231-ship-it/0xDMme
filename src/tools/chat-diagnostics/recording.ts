export interface TraceEvent {
  ms: number;
  kind: string;
  [field: string]: string | number | boolean | readonly string[];
}
export type RecordEvent = (
  kind: string,
  data?: Omit<TraceEvent, 'ms' | 'kind'>,
) => void;

/** Only callers with fixed labels and numerical measurements belong here.
 * No payloads, errors, identity, DOM text or arbitrary user annotations. */
export class Recording {
  private readonly started = performance.now();
  private readonly events: TraceEvent[] = [];
  private dropped = 0;
  private ended: number | null = null;
  readonly record: RecordEvent = (kind, data = {}) => {
    if (this.ended !== null) return;
    if (this.events.length === 1500) {
      this.events.shift();
      this.dropped++;
    }
    this.events.push({ ...data, ms: this.elapsed(), kind });
  };
  elapsed(): number {
    return Math.round((this.ended ?? performance.now()) - this.started);
  }
  stop(): void {
    this.record('capture-stopped');
    this.ended ??= performance.now();
  }
  report() {
    return {
      schema: 1,
      active: this.ended === null,
      elapsedMs: this.elapsed(),
      droppedEvents: this.dropped,
      limits: { events: 1500, durationMs: 600_000 },
      coverage: {
        requestsAndLocks: 'started-after-installation-in-this-tab',
        stream: 'complete-empty-control-frames-only; route-unverified',
        causality: 'timeline-and-caller-positions; not-an-automatic-diagnosis',
      },
      events: this.events.map((event) => ({ ...event })),
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
