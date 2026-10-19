import { t, translatedError } from '../../shared/i18n/index.ts';
import { AccountError } from '../../shared/account/index.ts';
import { HistoryPreparation } from './preparation.ts';
import { LiveUpdates } from '../message-live/index.ts';
import { ConversationOpening } from './opening.ts';
import type { LiveUpdate } from '../message-live/index.ts';
import type { VaultWorkOptions } from '../vault-authority/index.ts';

interface SynchronizationState {
  generation: number;
  connected: boolean;
  session: boolean;
  online: boolean;
  visible: boolean;
  suspended: boolean;
  liveConnecting: boolean;
  startupPending?: boolean;
  textPending?: boolean;
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
  refresh: (work: VaultWorkOptions) => Promise<void>;
  changes: (work: VaultWorkOptions) => Promise<void>;
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
  private interactiveChange = false;
  private maintenance: Promise<void> | null = null;
  private preloadTimer: ReturnType<typeof setTimeout> | null = null;
  private preloadAbort: AbortController | null = null;
  private preloadRunning = false;
  private preloadRetryAt = 0;
  private readonly preparation = new HistoryPreparation();
  private automaticAttempts = 0;
  private lastTransferAttempt = 0;
  private readonly opening = new ConversationOpening();
  busy = false;
  failed = false;

  constructor(options: SynchronizationOperations) {
    this.options = options;
    this.updates = new LiveUpdates({
      available: () =>
        this.canSynchronize() &&
        options.state().connected &&
        !this.preloadRunning &&
        !options.state().liveConnecting,
      run: (update) => {
        const work: VaultWorkOptions =
          this.interactiveChange && options.state().visible
            ? { priority: 'interactive' }
            : {};
        this.interactiveChange = false;
        if (update === 'refresh') void this.run(() => options.refresh(work));
        else void this.checkAutomatically(() => options.changes(work));
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
  request(update: LiveUpdate = 'refresh', work: VaultWorkOptions = {}): void {
    if (work.priority === 'interactive' && this.options.state().visible)
      this.stopPreload();
    this.interactiveChange ||= work.priority === 'interactive';
    this.prepareHistory();
    this.automaticAttempts = 0;
    this.updates.request(update);
  }
  /** Finish the current owner, then yield a multi-owner recheck to a saved
   * user send, requested opening or newer visible live hint. Keep one coalesced
   * hint for the remainder. */
  continueChanges(): boolean {
    const state = this.options.state();
    if (
      !(this.interactiveChange && state.visible) &&
      !state.textPending &&
      !this.opening.waiting
    )
      return true;
    this.updates.request('probe');
    return false;
  }
  startRefresh(): void {
    this.interactiveChange = false;
    this.updates.clear();
    this.lastTransferAttempt = Date.now();
  }
  reset(): void {
    this.interactiveChange = false;
    this.cancelOpening();
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
  /** Accept a visible row while startup owns the engine; the latest choice
   * runs before maintenance resumes, without overlapping either operation. */
  open(work: () => Promise<void>): Promise<void> {
    if (this.closed) return Promise.resolve();
    const result = this.opening.request(work);
    if (!this.busy) void this.openNext();
    return result;
  }
  cancelOpening(): void {
    this.opening.clear();
  }
  private async openNext(): Promise<void> {
    const pending = this.opening.take();
    if (!pending) return;
    try {
      await this.run(pending.work);
    } finally {
      pending.done();
    }
  }
  get openingRequested(): boolean {
    return this.opening.waiting;
  }
  get backgroundReady(): boolean {
    return this.canSynchronize();
  }
  async background(work: () => Promise<void>): Promise<void> {
    await this.maintain(work, (error) => {
      this.report(error, t('Não foi possível concluir a operação.'));
    });
  }
  async run(work: () => Promise<void>): Promise<boolean> {
    if (this.closed || this.busy) return false;
    this.stopPreload();
    this.busy = true;
    this.failed = false;
    const current = this.options.state().generation;
    this.options.status();
    try {
      // A user action waits for automatic maintenance instead of being dropped.
      await this.maintenance;
      if (!this.current(current)) return false;
      this.failed = false;
      await work();
      if (!this.current(current)) return false;
      if (this.options.state().online && !this.opening.waiting)
        this.options.complete();
      return true;
    } catch (error: unknown) {
      if (this.current(current)) {
        this.failed = true;
        this.report(error, t('Não foi possível concluir a operação.'));
      }
      return false;
    } finally {
      await this.finishRun(current);
    }
  }
  private async projectPending(current: number): Promise<void> {
    if (this.current(current)) {
      try {
        await this.options.renderPending();
      } catch {
        if (this.current(current))
          this.options.notice(
            t('Não foi possível abrir os envios pendentes deste aparelho.'),
          );
      }
    }
  }
  private async finishRun(current: number): Promise<void> {
    // Keep the operation exclusive until its final pending projection settles.
    await this.projectPending(current);
    if (this.current(current) && this.failed) this.opening.clear();
    this.busy = false;
    await this.openNext();
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
    return this.foregroundReady && state.visible && !state.textPending;
  }
  get foregroundReady(): boolean {
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
    const state = this.options.state();
    return this.canSynchronize() && state.connected && !state.startupPending;
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
          t('Não foi possível preparar o histórico das conversas.'),
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

  /** Automatic reads share the maintenance lock. An interactive operation can
   * reserve busy and wait for them instead of being rejected as another sync. */
  private async checkAutomatically(work: () => Promise<void>): Promise<void> {
    const current = this.options.state().generation;
    await this.maintain(
      async () => {
        this.failed = false;
        await work();
        if (!this.current(current)) return;
        if (this.options.state().online) this.options.complete();
        await this.projectPending(current);
        if (!this.busy) this.options.status();
      },
      (error) => {
        this.failed = true;
        this.report(error, t('Não foi possível concluir a operação.'));
      },
    );
  }
  async maintainPresence(): Promise<void> {
    if (!this.options.state().visible) return;
    await this.maintain(this.options.presence, (error) => {
      this.report(error, t('Não foi possível atualizar a presença.'));
    });
  }
  private async maintain(
    work: () => Promise<void>,
    failure: (error: unknown) => void,
  ): Promise<void> {
    if (!this.canSynchronize()) return;
    const current = this.options.state().generation;
    this.stopPreload();
    this.maintenance = Promise.resolve()
      .then(() => {
        if (this.current(current)) return work();
      })
      .catch((error: unknown) => {
        if (!this.current(current)) return;
        failure(error);
        if (!this.busy) this.options.status();
      })
      .finally(() => {
        this.maintenance = null;
        if (this.current(current)) this.options.status();
        this.updates.resume();
        this.schedulePreload();
      });
    await this.maintenance;
  }
  private pendingRetryAllowed(): boolean {
    return (
      this.automaticAttempts < 3 &&
      Date.now() - this.lastTransferAttempt >= 60000
    );
  }
  async pendingWork(): Promise<boolean> {
    return (
      this.pendingRetryAllowed() && (await this.options.pending()).length > 0
    );
  }
  async resumePending(): Promise<void> {
    if (!this.pendingRetryAllowed()) return;
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
      await this.checkAutomatically(this.options.periodic);
    } catch (error: unknown) {
      if (!this.current(current)) return;
      this.report(error, t('Não foi possível conferir os envios pendentes.'));
      this.options.status();
    }
  }
  private report(error: unknown, fallback: string): void {
    this.options.notice(
      error instanceof Error ? translatedError(error.message) : fallback,
    );
  }
}
