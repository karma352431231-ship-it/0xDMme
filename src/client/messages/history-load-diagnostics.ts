import { startLoad } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';

/** Owns only the requested opening's diagnostic lifetime, including scheduler wait. */
export class HistoryLoadDiagnostics {
  private opening: {
    peer: string;
    trace: LoadTrace;
    presented: boolean;
  } | null = null;
  request(peer: string): void {
    this.reset();
    const trace = startLoad('history', peer);
    if (trace) this.opening = { peer, trace, presented: false };
  }
  presented(
    peer: string | undefined,
    history: HTMLElement,
    rows: number,
  ): void {
    const opening = this.opening;
    if (!opening || opening.peer !== peer || opening.presented) return;
    opening.presented = true;
    opening.trace.point('verified', { loadRows: rows });
    opening.trace.point('dom', { loadRows: rows });
    opening.trace.frame(history, () => this.opening === opening);
  }
  reset(): void {
    this.opening?.trace.point('cancelled', { loadOutcome: 'cancelled' });
    this.opening = null;
  }
}
