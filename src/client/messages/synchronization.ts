import { AccountError } from '../../shared/account/index.ts';
import { HistoryPreparation } from './preparation.ts';
import { LiveUpdates } from '../message-live/index.ts';
import type { LiveUpdate } from '../message-live/index.ts';

interface SynchronizationState {
  generation: number;
  connected: boolean;
  session: boolean;
  online: boolean;
  visible: boolean;
  suspended: boolean;
  liveConnecting: boolean;
}
interface SynchronizationOperations {
  state: () => SynchronizationState;
  status: () => void;
  notice: (message: string) => void;
  complete: () => void;
  renderPending: () => Promise<void>;
  pause: () => void;
  preloadDirect: (signal: AbortSignal) => Promise<boolean>;
  preloadGroups: (signal: AbortSignal) => Promise<boolean>;
  presence: () => Promise<void>;
  refresh: () => Promise<void>;
  changes: () => Promise<void>;
  periodic: () => Promise<void>;
  periodicWork: () => Promise<boolean>;
  pending: () => Promise<readonly unknown[]>;
  sendPending: () => Promise<void>;
}

/** Scheduling and cancellation only. Authority and crypto stay in their owners. */
export class MessageSynchronization {
  private readonly options: SynchronizationOperations;
  private readonly updates: LiveUpdates;
  private closed = false;
  private maintenance: Promise<void> | null = null;
  private preloadTimer: ReturnType<typeof setTimeout> | null = null;
  private preloadAbort: AbortController | null = null;
  private preloadRunning = false;
  private preloadRetryAt = 0;
  private readonly preparation = new HistoryPreparation();
  private automaticAttempts = 0;
  private lastTransferAttempt = 0;
  busy = false;
  failed = false;

  constructor(options: SynchronizationOperations) {
    this.options = options;
    this.updates = new LiveUpdates({
      available: () =>
        this.canPreload() &&
        !this.preloadRunning &&
        !options.state().liveConnecting,
      run: (update) => {
        void this.run(update === 'refresh' ? options.refresh : options.changes);
      },
    });
  }
  resume(): void {
    this.updates.resume();
    this.schedulePreload();
  }
  prepareHistory(): void {
    this.preparation.request();
  }
  request(update: LiveUpdate = 'refresh'): void {
    this.prepareHistory();
    this.automaticAttempts = 0;
    this.updates.request(update);
  }
  startRefresh(): void {
    this.updates.clear();
    this.lastTransferAttempt = Date.now();
  }
  reset(): void {
    this.updates.clear();
    this.stopPreload();
    this.automaticAttempts = 0;
    this.lastTransferAttempt = 0;
    this.preloadRetryAt = 0;
    this.prepareHistory();
  }
  close(): void {
    this.closed = true;
    this.reset();
  }
  private current(generation: number): boolean {
    return !this.closed && generation === this.options.state().generation;
  }
  async run(work: () => Promise<void>): Promise<void> {
    if (this.closed || this.busy) return;
    this.stopPreload();
    this.busy = true;
    this.failed = false;
    const current = this.options.state().generation;
    this.options.status();
    try {
      // A user action waits for presence maintenance instead of being dropped.
      await this.maintenance;
      if (!this.current(current)) return;
      await work();
      if (!this.current(current)) return;
      if (this.options.state().online) this.options.complete();
    } catch (error: unknown) {
      if (this.current(current)) {
        this.failed = true;
        this.report(error, 'Não foi possível concluir a operação.');
      }
    } finally {
      await this.finishRun(current);
    }
  }
  private async finishRun(current: number): Promise<void> {
    // Keep the operation exclusive until its final pending projection settles.
    if (this.current(current)) {
      try {
        await this.options.renderPending();
      } catch {
        if (this.current(current))
          this.options.notice(
            'Não foi possível abrir os envios pendentes deste aparelho.',
          );
      }
    }
    this.busy = false;
    this.options.status();
    this.updates.resume();
    this.schedulePreload();
  }
  stopPreload(): void {
    if (this.preloadTimer !== null) clearTimeout(this.preloadTimer);
    this.preloadTimer = null;
    this.preloadAbort?.abort();
    this.options.pause();
  }
  private canSynchronize(): boolean {
    const state = this.options.state();
    return (
      !this.closed &&
      !this.busy &&
      this.maintenance === null &&
      state.session &&
      state.online &&
      !state.suspended
    );
  }
  private canPreload(): boolean {
    return this.canSynchronize() && this.options.state().connected;
  }
  private schedulePreload(): void {
    if (
      this.preloadRunning ||
      this.preloadTimer !== null ||
      !this.canPreload() ||
      !this.preparation.pending
    )
      return;
    this.enqueuePreload();
  }
  private enqueuePreload(): void {
    this.preloadTimer = setTimeout(
      () => {
        this.preloadTimer = null;
        void this.preloadHistory();
      },
      Math.max(1000, this.preloadRetryAt - Date.now()),
    );
  }
  private async preloadHistory(): Promise<void> {
    if (!this.canPreload() || this.preloadRunning) return;
    this.preloadRunning = true;
    const abort = new AbortController(),
      current = this.options.state().generation;
    this.preloadAbort = abort;
    try {
      await this.preloadBranch(abort.signal, current);
    } catch (error: unknown) {
      if (!abort.signal.aborted && this.current(current)) {
        this.report(
          error,
          'Não foi possível preparar o histórico das conversas.',
        );
        this.options.status();
        // A concurrent snapshot change needs another current read, not the
        // minute backoff reserved for rate limits and operational failures.
        this.preloadRetryAt =
          Date.now() +
          (error instanceof AccountError && error.status === 409
            ? 1000
            : 61000);
      }
    } finally {
      this.preloadRunning = false;
      if (this.preloadAbort === abort) this.preloadAbort = null;
      this.updates.resume();
      this.continuePreload(current);
    }
  }
  private continuePreload(current: number): void {
    if (
      !this.current(current) ||
      !this.canPreload() ||
      !this.preparation.pending
    )
      return;
    // A completed branch stays complete until foreground/live work arrives.
    this.enqueuePreload();
  }
  private async preloadBranch(
    signal: AbortSignal,
    current: number,
  ): Promise<void> {
    const turn = this.preparation.next();
    if (!turn) return;
    const pending = await (turn.kind === 'groups'
      ? this.options.preloadGroups(signal)
      : this.options.preloadDirect(signal));
    if (signal.aborted || !this.current(current)) return;
    this.preparation.complete(turn, pending);
  }

  async maintainPresence(): Promise<void> {
    if (!this.canSynchronize() || !this.options.state().visible) return;
    const current = this.options.state().generation;
    this.stopPreload();
    this.maintenance = this.options
      .presence()
      .catch((error: unknown) => {
        if (!this.current(current)) return;
        this.report(error, 'Não foi possível atualizar a presença.');
        if (!this.busy) this.options.status();
      })
      .finally(() => {
        this.maintenance = null;
        this.updates.resume();
        this.schedulePreload();
      });
    await this.maintenance;
  }
  async resumePending(): Promise<void> {
    if (
      this.automaticAttempts >= 3 ||
      Date.now() - this.lastTransferAttempt < 60000
    )
      return;
    const current = this.options.state().generation;
    this.lastTransferAttempt = Date.now();
    if (!(await this.options.pending()).length || !this.current(current))
      return;
    this.automaticAttempts++;
    await this.options.sendPending();
  }
  async periodicTick(): Promise<void> {
    if (!this.canSynchronize()) return;
    const current = this.options.state().generation;
    try {
      if (!this.options.state().connected) this.prepareHistory();
      if (this.options.state().visible) await this.maintainPresence();
      if (!this.current(current) || !this.canSynchronize()) return;
      if (!(await this.options.periodicWork()) || !this.current(current))
        return;
      await this.run(this.options.periodic);
    } catch (error: unknown) {
      if (!this.current(current)) return;
      this.report(error, 'Não foi possível conferir os envios pendentes.');
      this.options.status();
    }
  }
  private report(error: unknown, fallback: string): void {
    this.options.notice(error instanceof Error ? error.message : fallback);
  }
}
