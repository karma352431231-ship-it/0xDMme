import { t, translatedError } from '../../shared/i18n/index.ts';
import { MessageWarmup } from './warmup.ts';
import { MessageInbox } from './inbox.ts';
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
  changeMaintenance: readonly [
    () => Promise<void>,
    () => Promise<void>,
    () => Promise<void>,
  ];
  periodic: () => Promise<void>;
  periodicWork: () => Promise<boolean>;
  pending: () => Promise<readonly unknown[]>;
  sendPending: () => Promise<void>;
}

/** Scheduling and cancellation only. Authority and crypto stay in their owners. */
export class MessageSynchronization {
  private readonly options: SynchronizationOperations;
  private readonly updates: LiveUpdates;
  private readonly followup: MessageWarmup;
  private closed = false;
  private interactiveChange = false;
  private maintenance: Promise<void> | null = null;
  private readonly inbox: MessageInbox;
  private automaticAttempts = 0;
  private lastTransferAttempt = 0;
  private readonly opening = new ConversationOpening();
  busy = false;
  failed = false;

  constructor(options: SynchronizationOperations) {
    this.options = options;
    this.inbox = new MessageInbox({
      ready: () => this.canPreload(),
      generation: () => options.state().generation,
      current: (generation) => this.current(generation),
      direct: (signal) => options.preloadDirect(signal),
      groups: (signal) => options.preloadGroups(signal),
      pause: () => options.pause(),
      changed: () => this.resume(),
      settled: () => options.complete(),
      failed: (error) => {
        this.report(error, t('Could not prepare conversation history.'));
        options.status();
      },
    });
    this.updates = new LiveUpdates({
      available: () => this.canSynchronize() && !options.state().liveConnecting,
      run: (update) => {
        const work: VaultWorkOptions =
          this.interactiveChange && options.state().visible
            ? { priority: 'interactive' }
            : {};
        this.interactiveChange = false;
        if (update === 'refresh') void this.run(() => options.refresh(work));
        else void this.checkChanges(work);
      },
    });
    this.followup = new MessageWarmup({
      available: () => this.backgroundReady,
      run: (step) => this.background(step),
      changed: () => this.resume(),
      failed: (error) =>
        this.report(error, t('Could not complete the operation.')),
      steps: options.changeMaintenance,
    });
  }
  resume(work: VaultWorkOptions = {}): void {
    if (this.updates.waiting && this.options.state().visible)
      this.interactiveChange ||= work.priority === 'interactive';
    this.updates.resume();
    this.followup.resume();
    this.inbox.resume();
  }
  prepareHistory(): void {
    this.inbox.request();
  }
  request(update: LiveUpdate = 'refresh', work: VaultWorkOptions = {}): void {
    if (work.priority === 'interactive' && this.options.state().visible)
      this.stopPreload();
    this.interactiveChange ||= work.priority === 'interactive';
    this.prepareHistory();
    this.automaticAttempts = 0;
    this.updates.request(update);
  }
  startRefresh(): void {
    this.followup.reset();
    this.interactiveChange = false;
    this.updates.clear();
    this.lastTransferAttempt = Date.now();
  }
  reset(): void {
    this.followup.reset();
    this.interactiveChange = false;
    this.cancelOpening();
    this.updates.clear();
    this.automaticAttempts = 0;
    this.lastTransferAttempt = 0;
    this.inbox.reset();
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
  /** Profile maintenance may run outside the mounted conversation, but must
   * yield to an active owner or a queued current-history/user operation. */
  get conversationWorkPending(): boolean {
    return (
      this.busy ||
      this.maintenance !== null ||
      this.updates.waiting ||
      this.opening.waiting
    );
  }
  get backgroundReady(): boolean {
    return this.canSynchronize() && !this.updates.waiting;
  }
  async background(work: () => Promise<void>): Promise<void> {
    await this.maintain(work, (error) => {
      this.report(error, t('Could not complete the operation.'));
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
        this.report(error, t('Could not complete the operation.'));
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
            t('Could not open pending sends on this device.'),
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
    this.resume();
  }
  stopPreload(): void {
    this.inbox.pause();
  }

  private canSynchronize(): boolean {
    const state = this.options.state();
    return (
      this.foregroundReady &&
      !this.inbox.running &&
      state.visible &&
      !state.textPending
    );
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
    return this.canSynchronize() && !state.startupPending;
  }
  private async checkChanges(work: VaultWorkOptions): Promise<void> {
    const current = this.options.state().generation;
    await this.checkAutomatically(async () => {
      await this.options.changes(work);
      if (this.current(current)) this.followup.queue();
    });
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
        this.report(error, t('Could not complete the operation.'));
      },
    );
  }
  async maintainPresence(): Promise<void> {
    if (!this.options.state().visible) return;
    await this.maintain(this.options.presence, (error) => {
      this.report(error, t('Could not update presence.'));
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
        this.resume();
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
      this.report(error, t('Could not check pending sends.'));
      this.options.status();
    }
  }
  private report(error: unknown, fallback: string): void {
    this.options.notice(
      error instanceof Error ? translatedError(error.message) : fallback,
    );
  }
}
