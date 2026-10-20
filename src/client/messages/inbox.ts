import { retrySnapshotRead } from './snapshot-retry.ts';
import { AccountError } from '../../shared/account/index.ts';
import { HistoryPreparation } from './preparation.ts';

interface InboxPorts {
  ready: () => boolean;
  generation: () => number;
  current: (generation: number) => boolean;
  direct: (signal: AbortSignal) => Promise<boolean>;
  groups: (signal: AbortSignal) => Promise<boolean>;
  pause: () => void;
  changed: () => void;
  received: () => void | Promise<void>;
  failed: (error: unknown) => void;
}

/** Account-wide receipt scheduling. Each owner verifies and durably stores one
 * bounded page; this module never selects a chat or acknowledges reading it. */
export class MessageInbox {
  private readonly ports: InboxPorts;
  private readonly preparation = new HistoryPreparation();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private retryAt = 0;
  running = false;

  constructor(ports: InboxPorts) {
    this.ports = ports;
  }
  request(): void {
    this.preparation.request();
  }
  reset(): void {
    this.pause();
    this.retryAt = 0;
    this.request();
  }
  pause(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
    this.ports.pause();
  }
  resume(): void {
    if (
      this.running ||
      this.timer !== null ||
      !this.ports.ready() ||
      !this.preparation.pending
    )
      return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        void this.receive();
      },
      Math.max(1000, this.retryAt - Date.now()),
    );
  }
  private async receive(): Promise<void> {
    if (!this.ports.ready() || this.running) return;
    this.running = true;
    const abort = new AbortController(),
      generation = this.ports.generation();
    this.abort = abort;
    try {
      await this.receivePage(abort.signal, generation);
    } catch (error: unknown) {
      if (!abort.signal.aborted && this.ports.current(generation)) {
        this.ports.failed(error);
        this.retryAt =
          Date.now() +
          (error instanceof AccountError && error.status === 409
            ? 1000
            : 61000);
      }
    } finally {
      this.running = false;
      if (this.abort === abort) this.abort = null;
      this.ports.changed();
      if (this.ports.current(generation)) this.resume();
    }
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
    this.retryAt = 0;
    await this.ports.received();
  }
}
