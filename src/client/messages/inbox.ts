import {
  expectedInterruption,
  WorkInterruption,
  SynchronizationTask,
} from '../synchronization-work/index.ts';
import { measureWork } from '../synchronization-diagnostics/index.ts';
import { retrySnapshotRead } from './snapshot-retry.ts';
import { AccountError } from '../../shared/account/index.ts';
import { HistoryPreparation } from './preparation.ts';
import type { HistoryKind, PreparationTurn } from './preparation.ts';

interface InboxPorts {
  ready: () => boolean;
  /** Live receipt eligibility; send quiet time and decoration do not apply. */
  receiptReady: () => boolean;
  generation: () => number;
  current: (generation: number) => boolean;
  direct: (signal: AbortSignal) => Promise<boolean>;
  groups: (signal: AbortSignal) => Promise<boolean>;
  pause: () => void;
  changed: () => void;
  /** `live` reports whether the page answered live demand. */
  received: (scope: HistoryKind, live: boolean) => void | Promise<void>;
  failed: (error: unknown, live: boolean) => void;
}

/** Account-wide receipt scheduling. Each owner verifies and durably stores one
 * bounded page; this module never selects a chat or acknowledges reading it.
 * Live demand runs promptly; speculative preparation keeps its quiet delay. */
export class MessageInbox {
  private readonly ports: InboxPorts;
  private readonly preparation = new HistoryPreparation();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private readonly continuationTask = new SynchronizationTask(() => {
    void this.receive();
  });
  private retryAt = 0;
  private readonly continuing = new Set<HistoryKind>();
  private readonly demanded = new Set<HistoryKind>();
  private active: { live: boolean; done: Promise<void> } | null = null;
  running = false;

  constructor(ports: InboxPorts) {
    this.ports = ports;
  }
  request(scope?: HistoryKind): void {
    this.preparation.request(scope);
  }
  /** A live change hint: receive this area ahead of speculative preparation. */
  demand(scope: HistoryKind): void {
    this.preparation.request(scope);
    this.demanded.add(scope);
  }
  /** Runnable live demand, which decorative maintenance must not delay. */
  get urgent(): boolean {
    return this.demanded.size > 0 && this.retryAt <= Date.now();
  }
  reset(): void {
    this.pause();
    this.retryAt = 0;
    this.continuing.clear();
    this.demanded.clear();
    this.request();
  }
  /** Yield after the active bounded page commits; avoid fetching it again. */
  defer(): void {
    this.continuationTask.clear();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  pause(): void {
    this.defer();
    this.abort?.abort(new WorkInterruption('scheduler'));
    this.ports.pause();
  }
  /** Foreground work waits for a live page to commit instead of discarding its
   * progress; speculative preparation is still interrupted. */
  async settle(): Promise<void> {
    if (!this.active?.live) {
      this.pause();
      return;
    }
    this.defer();
    await this.active.done;
  }
  resume(): void {
    if (
      this.running ||
      this.timer !== null ||
      this.continuationTask.pending ||
      !this.preparation.pending
    )
      return;
    const next = this.preparation.next(this.demanded);
    if (!next || !this.ready(next.kind)) return;
    const prompt =
      this.demanded.has(next.kind) || this.continuing.has(next.kind);
    const wait = Math.max(prompt ? 0 : 1000, this.retryAt - Date.now());
    if (wait <= 0) {
      this.continuationTask.schedule();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.receive();
    }, wait);
  }
  private ready(kind: HistoryKind): boolean {
    return this.demanded.has(kind)
      ? this.ports.receiptReady()
      : this.ports.ready();
  }
  private async receive(): Promise<void> {
    if (this.running) return;
    const turn = this.preparation.next(this.demanded);
    if (!turn || !this.ready(turn.kind)) return;
    this.running = true;
    const abort = new AbortController(),
      generation = this.ports.generation();
    this.abort = abort;
    let settled = () => {};
    this.active = {
      live: this.demanded.has(turn.kind),
      done: new Promise<void>((resolve) => {
        settled = resolve;
      }),
    };
    try {
      await measureWork(this, 'inbox', () =>
        this.receivePage(turn, abort.signal, generation),
      );
    } catch (error: unknown) {
      this.resumeInterrupted(error, turn);
      this.fail(error, abort.signal, generation);
    } finally {
      this.running = false;
      this.active = null;
      settled();
      if (this.abort === abort) this.abort = null;
      this.ports.changed();
      if (this.ports.current(generation)) this.resume();
    }
  }
  private resumeInterrupted(error: unknown, turn: PreparationTurn): void {
    if (!expectedInterruption(error)) return;
    this.continuing.add(turn.kind);
    this.preparation.complete(turn, true);
  }
  private fail(error: unknown, signal: AbortSignal, generation: number): void {
    if (
      signal.aborted ||
      expectedInterruption(error) ||
      !this.ports.current(generation)
    )
      return;
    this.ports.failed(error, this.active?.live ?? false);
    this.retryAt =
      Date.now() +
      (error instanceof AccountError && error.status === 409 ? 1000 : 61000);
  }
  private async receivePage(
    turn: PreparationTurn,
    signal: AbortSignal,
    generation: number,
  ): Promise<void> {
    const more = await retrySnapshotRead(
      () =>
        turn.kind === 'groups'
          ? this.ports.groups(signal)
          : this.ports.direct(signal),
      () => !signal.aborted && this.ports.current(generation),
    );
    if (signal.aborted || !this.ports.current(generation)) return;
    this.preparation.complete(turn, more);
    if (more) this.continuing.add(turn.kind);
    else this.continuing.delete(turn.kind);
    // A hint that arrived during this page keeps its demand for the successor.
    if (!this.preparation.has(turn.kind)) this.demanded.delete(turn.kind);
    this.retryAt = 0;
    await this.ports.received(turn.kind, this.active?.live ?? false);
  }
}
