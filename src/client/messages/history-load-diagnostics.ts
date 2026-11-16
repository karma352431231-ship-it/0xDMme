import {
  startHistoryLoad,
  presentHistoryLoad,
} from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';

/** Owns only the requested opening's diagnostic lifetime, including scheduler wait. */
export class HistoryLoadDiagnostics {
  private opening: {
    peer: string;
    trace: LoadTrace;
    presented: boolean;
  } | null = null;
  request(peer: string): LoadTrace | undefined {
    this.reset();
    const trace = startHistoryLoad('history', 'open', peer);
    if (trace) this.opening = { peer, trace, presented: false };
    return trace;
  }
  pending(peer: string | undefined): LoadTrace | undefined {
    return this.opening?.peer === peer && !this.opening?.presented
      ? this.opening?.trace
      : undefined;
  }
  presented(
    peer: string | undefined,
    history: HTMLElement,
    input: {
      rows: number;
      trace: LoadTrace | undefined;
      current: () => boolean;
    },
  ): void {
    const opening = this.opening;
    const trace = input.trace ?? this.pending(peer);
    if (opening && trace === opening.trace) opening.presented = true;
    presentHistoryLoad(trace, history, input.rows, input.current);
  }
  reset(): void {
    this.opening?.trace.point('cancelled', { loadOutcome: 'cancelled' });
    this.opening = null;
  }
}
