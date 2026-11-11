import { readChatSyncTrace } from '../../shared/chat-sync-diagnostics/index.ts';
import type { ChatSyncTrace } from '../../shared/chat-sync-diagnostics/index.ts';

const startupKinds = new Set([
  'app-startup',
  'account-restore',
  'private-profile',
  'contacts',
  'conversation-list',
  'directory-startup',
  'conversation-previews',
]);
interface Retained {
  at: number;
  trace: ChatSyncTrace;
}
/** Diagnostic APK only. Separate bounded lanes keep boot milestones when work is noisy. */
export class EarlyCapture {
  private readonly milestones: Retained[] = [];
  private readonly timeline: Retained[] = [];
  dropped = 0;
  longTasks = false;
  private observer: PerformanceObserver | undefined;
  constructor() {
    if (
      typeof PerformanceObserver === 'undefined' ||
      !PerformanceObserver.supportedEntryTypes.includes('longtask')
    )
      return;
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        this.record(
          {
            version: 1,
            source: 0,
            conversation: 0,
            event: 'boot-task',
            reason: 'settled',
            bootTaskMs: Math.round(entry.duration),
          },
          entry.startTime + entry.duration,
        );
    });
    try {
      this.observer.observe({ type: 'longtask', buffered: true });
      this.longTasks = true;
    } catch {
      this.dispose();
    }
  }
  dispose(): void {
    this.observer?.disconnect();
  }
  record(input: ChatSyncTrace, at = performance.now()): void {
    const trace = readChatSyncTrace(input);
    if (!trace) return;
    const important =
      trace.event === 'boot' ||
      (trace.event === 'load' && startupKinds.has(trace.loadKind ?? ''));
    const lane = important ? this.milestones : this.timeline;
    const limit = important ? 512 : 988;
    if (lane.length === limit) {
      this.dropped++;
      if (important) return;
      lane.shift();
    }
    lane.push({ at, trace });
  }
  replay(publish: (trace: ChatSyncTrace) => void): void {
    this.dispose();
    const now = performance.now();
    const entries = [...this.milestones, ...this.timeline].sort(
      (a, b) => a.at - b.at,
    );
    this.milestones.length = this.timeline.length = 0;
    for (const { at, trace } of entries)
      publish({ ...trace, beforeCaptureMs: Math.max(0, Math.round(now - at)) });
  }
}
