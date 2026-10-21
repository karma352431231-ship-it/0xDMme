import {
  expectedInterruption,
  WorkInterruption,
  SynchronizationTask,
} from '../synchronization-work/index.ts';
import { measureWork } from '../synchronization-diagnostics/index.ts';
import { retrySnapshotRead } from './snapshot-retry.ts';
import { AccountError } from '../../shared/account/index.ts';
import { HistoryPreparation } from './preparation.ts';
import type { HistoryKind } from './preparation.ts';

interface InboxPorts {
  ready: () => boolean;
  generation: () => number;
  current: (generation: number) => boolean;
  direct: (signal: AbortSignal) => Promise<boolean>;
  groups: (signal: AbortSignal) => Promise<boolean>;
  pause: () => void;
  changed: () => void;
  received: (scope: HistoryKind) => void | Promise<void>;
  failed: (error: unknown) => void;
}

/** Account-wide receipt scheduling. Each owner verifies and durably stores one
 * bounded page; this module never selects a chat or acknowledges reading it. */
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
  running = false;

  constructor(ports: InboxPorts) {
    this.ports = ports;
  }
  request(scope?: HistoryKind): void {
    this.preparation.request(scope);
  }
  reset(): void {
    this.pause();
    this.retryAt = 0;
    this.continuing.clear();
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
  resume(): void {
    if (
      this.running ||
      this.timer !== null ||
      this.continuationTask.pending ||
      !this.ports.ready() ||
      !this.preparation.pending
    )
      return;
    const next = this.preparation.next();
    const delay = next && this.continuing.has(next.kind) ? 0 : 1000;
    const wait = Math.max(delay, this.retryAt - Date.now());
    if (wait <= 0) {
      this.continuationTask.schedule();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.receive();
    }, wait);
  }
  private async receive(): Promise<void> {
    if (!this.ports.ready() || this.running) return;
    this.running = true;
    const abort = new AbortController(),
      generation = this.ports.generation();
    this.abort = abort;
    try {
      await measureWork(this, 'inbox', () =>
        this.receivePage(abort.signal, generation),
      );
    } catch (error: unknown) {
      this.resumeInterrupted(error);
      this.fail(error, abort.signal, generation);
    } finally {
      this.running = false;
      if (this.abort === abort) this.abort = null;
      this.ports.changed();
      if (this.ports.current(generation)) this.resume();
    }
  }
  private resumeInterrupted(error: unknown): void {
    if (!expectedInterruption(error)) return;
    const turn = this.preparation.next();
    if (!turn) return;
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
    this.ports.failed(error);
    this.retryAt =
      Date.now() +
      (error instanceof AccountError && error.status === 409 ? 1000 : 61000);
  }
  private async receivePage(
    signal: AbortSignal,
    generation: number,
  ): Promise<void> {
    const turn = this.preparation.next();
    if (!turn) return;
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
    this.retryAt = 0;
    await this.ports.received(turn.kind);
  }
}
