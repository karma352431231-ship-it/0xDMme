import { loadHostVisible } from './load.ts';
import type { LoadTrace } from './load.ts';

/** Owns one data-to-visible-frame attempt. The feature retains all data authority. */
export class LoadingPresentation {
  private attempt: { trace: LoadTrace; rows: number | null } | undefined;
  private readonly begin: () => LoadTrace | undefined;
  constructor(begin: () => LoadTrace | undefined) {
    this.begin = begin;
  }
  cancel(): void {
    this.attempt?.trace.point('cancelled', { loadOutcome: 'cancelled' });
    this.attempt = undefined;
  }
  async run(
    work: (trace: LoadTrace | undefined) => Promise<number>,
  ): Promise<void> {
    this.cancel();
    const trace = this.begin();
    const attempt: LoadingPresentation['attempt'] = trace
      ? { trace, rows: null }
      : undefined;
    this.attempt = attempt;
    try {
      const rows = await work(trace);
      if (attempt && this.attempt === attempt) {
        attempt.rows = rows;
        trace?.point('verified', { loadRows: rows });
      }
    } catch (error: unknown) {
      trace?.point('failed', { loadOutcome: 'failed' });
      throw error;
    }
  }
  presented(host: HTMLElement | null, matchingRows = true): void {
    const attempt = this.attempt;
    if (!host || !attempt || attempt.rows === null) return;
    if (attempt.rows > 0 && !matchingRows) return;
    if (!loadHostVisible(host)) return;
    attempt.trace.point('dom');
    attempt.trace.frame(host, () => this.attempt === attempt);
  }
}
