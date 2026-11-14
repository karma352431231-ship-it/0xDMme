import {
  startReceiptDiagnostic,
  releaseReceiptDiagnostic,
  privateSendPoint,
  measurePrivateSend,
} from '../chat-sync-diagnostics/index.ts';
import type { PrivateSendContext } from '../chat-sync-diagnostics/index.ts';
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
import type { VaultWorkOptions } from '../vault-authority/index.ts';

interface InboxPorts {
  ready: () => boolean;
  /** Live receipt eligibility; send quiet time and decoration do not apply. */
  receiptReady: () => boolean;
  generation: () => number;
  current: (generation: number) => boolean;
  /** Live demand asks for interactive authority priority. */
  direct: (signal: AbortSignal, work: VaultWorkOptions) => Promise<boolean>;
  groups: (signal: AbortSignal, work: VaultWorkOptions) => Promise<boolean>;
  pause: () => void;
  changed: () => void;
  /** After a committed page, outside the turn; `live` reports whether the
   * page answered live demand. */
  received: (scope: HistoryKind, live: boolean) => void | Promise<void>;
  failed: (error: unknown, live: boolean) => void;
}

const historyKinds = ['direct', 'groups'] as const;

/** Account-wide receipt scheduling. Each owner verifies and durably stores one
 * bounded page; this module never selects a chat or acknowledges reading it.
 * Live demand runs promptly; speculative preparation keeps its quiet delay. */
export class MessageInbox {
  private readonly ports: InboxPorts;
  private readonly preparation = new HistoryPreparation();
  private timer: { at: number; handle: ReturnType<typeof setTimeout> } | null =
    null;
  private abort: AbortController | null = null;
  private readonly continuationTask = new SynchronizationTask(() => {
    void this.receive();
  });
  private readonly retryAt = { direct: 0, groups: 0 };
  private readonly continuing = new Set<HistoryKind>();
  private readonly demanded = new Set<HistoryKind>();
  private active: {
    live: boolean;
    done: Promise<void>;
    diagnostic: PrivateSendContext | undefined;
  } | null = null;
  private draftInterruptions = 0;
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
    const now = Date.now();
    return [...this.demanded].some((kind) => this.retryAt[kind] <= now);
  }
  reset(): void {
    this.draftInterruptions = 0;
    this.pause();
    for (const kind of historyKinds) this.retryAt[kind] = 0;
    this.continuing.clear();
    this.demanded.clear();
    this.request();
  }
  /** Yield after the active bounded page commits; avoid fetching it again. */
  defer(): void {
    this.continuationTask.clear();
    if (this.timer !== null) clearTimeout(this.timer.handle);
    this.timer = null;
  }
  pause(): void {
    this.defer();
    this.abort?.abort(new WorkInterruption('scheduler'));
    this.ports.pause();
  }
  /** Foreground work waits for a live page to commit instead of discarding its
   * progress; speculative preparation is still interrupted. */
  async settle(diagnostic?: PrivateSendContext): Promise<void> {
    if (!this.active?.live) {
      this.pause();
      return;
    }
    this.defer();
    const active = this.active;
    const linked = active.diagnostic && { ...active.diagnostic, ...diagnostic };
    privateSendPoint(linked, 'receipt-awaited');
    await active.done;
  }
  /** Local draft admission is interactive too: stop speculative IO before its
   * encrypted save queues behind that owner's native lock. Live receipt keeps
   * its existing durable settlement; domain guards/cleanup release the lock. */
  admitDraft(): boolean {
    this.defer();
    if (
      !this.active ||
      this.active.live ||
      this.abort?.signal.aborted ||
      this.draftInterruptions >= 4
    )
      return false;
    this.draftInterruptions++;
    privateSendPoint(this.active.diagnostic, 'receipt-yield', {
      receiptReason: 'draft-admission',
    });
    this.pause();
    return true;
  }
  resume(): void {
    if (
      this.running ||
      this.continuationTask.pending ||
      !this.preparation.pending
    )
      return;
    const now = Date.now();
    const next = this.next(now);
    const at = Math.min(
      next ? this.wakeAt(next.kind, now) : Infinity,
      ...historyKinds
        .filter((kind) => this.retryAt[kind] > now)
        .map((kind) => this.wakeAt(kind, now)),
    );
    if (!Number.isFinite(at) || (this.timer && this.timer.at <= at)) return;
    // A new live hint can overtake a speculative timer or the other inbox's
    // retry deadline. An already running page keeps exclusive ownership.
    if (this.timer) clearTimeout(this.timer.handle);
    this.timer = null;
    if (at <= now) {
      this.continuationTask.schedule();
      return;
    }
    this.timer = {
      at,
      handle: setTimeout(() => {
        this.timer = null;
        void this.receive();
      }, at - now),
    };
  }
  private wakeAt(kind: HistoryKind, now: number): number {
    if (!this.preparation.has(kind) || !this.ready(kind)) return Infinity;
    const prompt = this.demanded.has(kind) || this.continuing.has(kind);
    return Math.max(this.retryAt[kind], now + (prompt ? 0 : 1000));
  }
  private ready(kind: HistoryKind): boolean {
    return this.demanded.has(kind)
      ? this.ports.receiptReady()
      : this.ports.ready();
  }
  private next(now: number): PreparationTurn | null {
    return this.preparation.next(
      this.demanded,
      (kind) => this.retryAt[kind] <= now && this.ready(kind),
    );
  }
  private async receive(): Promise<void> {
    if (this.running) return;
    const turn = this.next(Date.now());
    if (!turn) return this.resume();
    this.running = true;
    const abort = new AbortController(),
      generation = this.ports.generation();
    this.abort = abort;
    let settled = () => {};
    const live = this.demanded.has(turn.kind);
    this.active = {
      live,
      diagnostic: startReceiptDiagnostic(turn.kind, live),
      done: new Promise<void>((resolve) => {
        settled = resolve;
      }),
    };
    const diagnostic = this.active.diagnostic;
    let committed = false;
    try {
      committed = await measureWork(this, 'inbox', () =>
        this.receivePage(turn, abort.signal, generation),
      );
    } catch (error: unknown) {
      privateSendPoint(diagnostic, 'receipt-failed', {
        receiptReason:
          abort.signal.aborted || expectedInterruption(error)
            ? 'cancelled'
            : 'failed',
      });
      this.resumeInterrupted(error, turn);
      this.fail(error, abort.signal, generation, turn.kind);
    } finally {
      releaseReceiptDiagnostic(diagnostic);
      privateSendPoint(diagnostic, 'receipt-complete', {
        receiptMore: this.preparation.has(turn.kind),
      });
      this.running = false;
      this.active = null;
      settled();
      if (this.abort === abort) this.abort = null;
      this.ports.changed();
      if (this.ports.current(generation)) this.resume();
    }
    if (committed) this.followUp(turn.kind, live, generation);
  }
  /** Counters, sound and visible read receipts follow a committed page outside
   * the turn, so the next live page never waits for them. Their own failures
   * are reported without delaying receipt. */
  private followUp(kind: HistoryKind, live: boolean, generation: number): void {
    void Promise.resolve()
      .then(() => this.ports.received(kind, live))
      .catch((error: unknown) => {
        if (this.ports.current(generation) && !expectedInterruption(error))
          this.ports.failed(error, false);
      });
  }
  private resumeInterrupted(error: unknown, turn: PreparationTurn): void {
    if (!expectedInterruption(error)) return;
    this.continuing.add(turn.kind);
    this.preparation.complete(turn, true);
  }
  private fail(
    error: unknown,
    signal: AbortSignal,
    generation: number,
    kind: HistoryKind,
  ): void {
    if (
      signal.aborted ||
      expectedInterruption(error) ||
      !this.ports.current(generation)
    )
      return;
    this.ports.failed(error, this.active?.live ?? false);
    const status = error instanceof AccountError ? error.status : 0;
    const retryAt = Date.now() + (status === 409 ? 1000 : 61000);
    this.retryAt[kind] = retryAt;
    // The existing account-wide cooldown still applies to an authority denial.
    if ([401, 403].includes(status))
      for (const scope of historyKinds) this.retryAt[scope] = retryAt;
  }
  private async receivePage(
    turn: PreparationTurn,
    signal: AbortSignal,
    generation: number,
  ): Promise<boolean> {
    const diagnostic = this.active?.diagnostic;
    let attempt = 0;
    const more = await retrySnapshotRead(
      () => {
        attempt++;
        const context = diagnostic
          ? { ...diagnostic, receiptAttempt: attempt }
          : undefined;
        privateSendPoint(context, 'receipt-attempt');
        const work: VaultWorkOptions = {
          ...(this.active?.live && turn.kind === 'direct'
            ? { priority: 'interactive' as const }
            : {}),
          privateSend: context,
        };
        return measurePrivateSend(context, 'receipt-attempt', () =>
          turn.kind === 'groups'
            ? this.ports.groups(signal, work)
            : this.ports.direct(signal, work),
        );
      },
      () => !signal.aborted && this.ports.current(generation),
      () =>
        privateSendPoint(diagnostic, 'receipt-retry', {
          receiptReason: 'snapshot-changed',
        }),
    );
    if (signal.aborted || !this.ports.current(generation)) return false;
    this.draftInterruptions = 0;
    this.preparation.complete(turn, more);
    if (more) this.continuing.add(turn.kind);
    else this.continuing.delete(turn.kind);
    // A hint that arrived during this page keeps its demand for the successor.
    if (!this.preparation.has(turn.kind)) this.demanded.delete(turn.kind);
    this.retryAt[turn.kind] = 0;
    return true;
  }
}
