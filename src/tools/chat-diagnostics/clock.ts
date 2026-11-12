import type { TraceEvent } from './events.ts';
export interface ClockBounds {
  available: boolean;
  consistent: boolean;
  samples: number;
  offsetMinMs: number | null;
  offsetMaxMs: number | null;
}
/** A server timestamp lies somewhere between local request and response.
 * Keep an interval, not an assumed symmetric-network offset. No extra traffic. */
export class ClockCalibration {
  private lower = -Infinity;
  private upper = Infinity;
  private samples = 0;
  private consistent = true;
  private readonly origin: number;
  constructor(origin: number) {
    this.origin = origin;
  }
  observe(event: TraceEvent): void {
    const server = event['serverUnixMs'],
      duration = event['durationMs'];
    if (
      event.kind !== 'response-headers' ||
      typeof server !== 'number' ||
      !Number.isSafeInteger(server) ||
      server < 946684800000
    )
      return;
    if (typeof duration !== 'number' || duration < 0 || duration > 15000)
      return;
    const received = this.origin + event.ms;
    this.lower = Math.max(this.lower, server - 2 - received);
    this.upper = Math.min(this.upper, server + 2 - (received - duration));
    this.samples++;
    this.consistent &&= this.lower <= this.upper;
  }
  report(): ClockBounds {
    return {
      available: this.samples > 0,
      consistent: this.consistent,
      samples: this.samples,
      offsetMinMs: this.samples ? this.lower : null,
      offsetMaxMs: this.samples ? this.upper : null,
    };
  }
}
