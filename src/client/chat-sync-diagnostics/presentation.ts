import { loadHostVisible } from './load.ts';
import type { LoadTrace } from './load.ts';

/** Owns one data-to-visible-frame attempt. The feature retains all data authority. */
export class LoadingPresentation {
  private attempt: { trace: LoadTrace; rows: number | null } | undefined;
  private initial = true;
  private continuing = false;
  private readonly begin: () => LoadTrace | undefined;
  constructor(begin: () => LoadTrace | undefined) {
    this.begin = begin;
  }
  cancel(): void {
    this.attempt?.trace.point('cancelled', { loadOutcome: 'cancelled' });
    this.attempt = undefined;
    this.continuing = false;
  }
  reset(): void {
    this.cancel();
    this.initial = true;
  }
  private start(): void {
    this.cancel();
    const trace = this.begin();
    trace?.point('entry', { loadInitial: this.initial });
    this.initial = false;
    this.attempt = trace ? { trace, rows: null } : undefined;
  }
  /** A continued verification keeps one bounded summary until its data is
   * complete, even when the domain yields across many authority turns. */
  async run(
    work: (trace: LoadTrace | undefined) => Promise<number>,
    continuation?: (error: unknown) => boolean,
  ): Promise<void> {
    if (!this.continuing) this.start();
    this.continuing = false;
    const attempt = this.attempt;
    const trace = attempt?.trace;
    try {
      const rows = await work(trace);
      if (attempt && this.attempt === attempt) {
        attempt.rows = rows;
        trace?.point('verified', { loadRows: rows });
      }
    } catch (error: unknown) {
      this.failedVerification(error, attempt, continuation);
      throw error;
    }
  }
  private failedVerification(
    error: unknown,
    attempt: LoadingPresentation['attempt'],
    continuation?: (error: unknown) => boolean,
  ): void {
    const trace = attempt?.trace;
    if (continuation?.(error) && attempt && this.attempt === attempt) {
      this.continuing = true;
      trace?.point('queue');
    } else trace?.point('failed', { loadOutcome: 'failed' });
  }
  presented(host: HTMLElement | null, matchingRows = true): void {
    const attempt = this.attempt;
    if (!host || !attempt || attempt.rows === null) return;
    if (attempt.rows > 0 && !matchingRows) return;
    if (!loadHostVisible(host)) return;
    attempt.trace.point('published');
    attempt.trace.point('dom');
    attempt.trace.frame(host, () => this.attempt === attempt);
  }
}
