import { startupLoadKind } from '../../shared/chat-sync-diagnostics/load.ts';
import type { TraceEvent } from './events.ts';
/** A separate first-events budget keeps startup evidence after timeline eviction. */
export class StartupDetails {
  private readonly milestones: TraceEvent[] = [];
  private readonly timeline: TraceEvent[] = [];
  private dropped = 0;
  observe(event: TraceEvent): void {
    const milestone =
      event.kind === 'reuse-boot' ||
      (event.kind === 'reuse-authority-work' &&
        typeof event['load'] === 'number') ||
      (event.kind === 'reuse-load' && startupLoadKind(event['loadKind']));
    if (!milestone && typeof event['beforeCaptureMs'] !== 'number') return;
    const lane = milestone ? this.milestones : this.timeline;
    if (lane.length >= (milestone ? 512 : 988)) {
      this.dropped++;
      return;
    }
    lane.push(structuredClone(event));
  }
  report() {
    return {
      limit: 1500,
      dropped: this.dropped,
      events: structuredClone(
        [...this.timeline, ...this.milestones].sort((a, b) => a.ms - b.ms),
      ),
    };
  }
}
