import { expectedInterruption } from '../synchronization-work/index.ts';
import { measureWork } from '../synchronization-diagnostics/index.ts';
import { MessageContinuationQueue, afterMessageWork } from './continuation.ts';
import type { MessageWork, MessageWorkResult } from './continuation.ts';
import { retrySnapshotRead } from './snapshot-retry.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { MessageChangeFollowup } from './change-followup.ts';
import type {
  ChangeFollowupPlan,
  ChangeFollowupScope,
} from './change-followup.ts';
import { MessageInbox } from './inbox.ts';
import type { HistoryKind } from './preparation.ts';
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
  /** A receiver page settled; defaults to `complete`. */
  receiptComplete?: () => void;
  renderPending: () => Promise<void>;
  pause: () => void;
  preloadDirect: (
    signal: AbortSignal,
    work: VaultWorkOptions,
  ) => Promise<boolean>;
  preloadGroups: (signal: AbortSignal) => Promise<boolean>;
  unread: () => Promise<void>;
  groupProjection?: () => Promise<void>;
  presence: () => Promise<void>;
  refresh: (work: VaultWorkOptions) => Promise<void>;
  /** Check the open conversation for a categorized change of this scope. */
  changes: (
    work: VaultWorkOptions,
    scope: ChangeFollowupScope,
  ) => Promise<void>;
  changeMaintenance: readonly [
    () => Promise<void>,
    () => Promise<void>,
    () => Promise<void>,
  ];
  periodic: () => Promise<void>;
  periodicWork: () => Promise<boolean>;
  pending: () => Promise<readonly unknown[]>;
  sendPending: () => Promise<void>;
  visibleSettled?: () => void;
}

/** Scheduling and cancellation only. Authority and crypto stay in their owners. */
export class MessageSynchronization {
  private readonly options: SynchronizationOperations;
  private readonly updates: LiveUpdates;
  private readonly followup: MessageChangeFollowup;
  private closed = false;
  private interactiveChange = false;
  private visibleChange: symbol | null = null;
  private receiptProjectionPending = false;
  private receiptFailed = false;
  private maintenance: Promise<void> | null = null;
  private readonly inbox: MessageInbox;
  private readonly continuation: MessageContinuationQueue;
  private historyGeneration = 0;
  private automaticAttempts = 0;
  private lastTransferAttempt = 0;
  private readonly opening = new ConversationOpening();
  busy = false;
  failed = false;

  constructor(options: SynchronizationOperations) {
    this.options = options;
    this.continuation = new MessageContinuationQueue({
      available: () => this.canSynchronize() && !options.state().liveConnecting,
      run: async (work) => {
        await this.run(async () => {
          await this.history(work);
        });
      },
    });
    this.inbox = new MessageInbox({
      ready: () => this.canPreload(),
      receiptReady: () => this.receiptReady,
      generation: () => options.state().generation,
      current: (generation) => this.current(generation),
      direct: (signal, work) => options.preloadDirect(signal, work),
      groups: (signal) => options.preloadGroups(signal),
      pause: () => options.pause(),
      changed: () => this.resume(),
      received: (scope, live) => {
        if (live && this.receiptFailed)
          this.failed = this.receiptFailed = false;
        return this.receivedPage(scope);
      },
      // Live receipt delivers the open chat, so its failure offers a retry
      // like the selected history read it replaced.
      failed: (error, live) => {
        if (live) this.failed = this.receiptFailed = true;
        this.report(error, t('Could not prepare conversation history.'));
        options.status();
      },
    });
    this.updates = new LiveUpdates({
      available: () =>
        this.canSynchronize() &&
        !this.continuation.waiting &&
        !options.state().liveConnecting,
      run: (update) => {
        const work: VaultWorkOptions =
          this.interactiveChange && options.state().visible
            ? { priority: 'interactive' }
            : {};
        this.interactiveChange = false;
        const scope = this.followup.take();
        if (update === 'refresh') void this.run(() => options.refresh(work));
        else void this.checkChanges(work, scope);
      },
    });
    this.followup = new MessageChangeFollowup({
      available: () => this.backgroundReady,
      run: (step) => this.background(step),
      changed: () => this.resume(),
      failed: (error) =>
        this.report(error, t('Could not complete the operation.')),
      unread: () => this.refreshUnread(),
      groups: () => this.refreshGroups(),
      steps: options.changeMaintenance,
    });
  }
  resume(work: VaultWorkOptions = {}): void {
    if (this.updates.waiting && this.options.state().visible)
      this.interactiveChange ||= work.priority === 'interactive';
    this.continuation.resume();
    this.updates.resume();
    this.followup.resume();
    this.inbox.resume();
  }
  prepareHistory(scope?: HistoryKind): void {
    this.inbox.request(scope);
  }
  requestInbox(scope: HistoryKind): void {
    this.prepareHistory(scope);
    this.resume();
  }
  /** A live content hint. The account receiver applies it promptly, whichever
   * chat is open; the open chat is updated from the same verified commit. */
  receive(scope: HistoryKind): void {
    this.inbox.demand(scope);
    this.resume();
  }
  request(
    update: LiveUpdate = 'refresh',
    work: VaultWorkOptions = {},
    scope?: HistoryKind,
  ): void {
    this.prepareHistory(scope);
    this.queueUpdate(update, work, scope ? 'content' : 'all', scope);
  }
  /** The open window fell behind a cut the account receiver already passed,
   * usually applied by another tab of this device. Only that window is read
   * again; asking the receiver for another page would find nothing and, while
   * the window stays behind, report it again without end. */
  windowBehind(scope: HistoryKind): void {
    this.queueUpdate('probe', {}, 'content', scope);
  }
  /** Delivery/read metadata changes do not imply a new encrypted receipt page. */
  requestProjection(
    work: VaultWorkOptions = {},
    scope: HistoryKind = 'direct',
  ): void {
    this.queueUpdate('probe', work, 'receipts', scope);
  }
  requestCounters(scope: HistoryKind): void {
    this.followup.counters(scope);
  }
  private queueUpdate(
    update: LiveUpdate,
    work: VaultWorkOptions,
    scope: ChangeFollowupScope,
    kind: HistoryKind = 'direct',
  ): void {
    if (work.priority === 'interactive' && this.options.state().visible)
      this.inbox.defer();
    this.interactiveChange ||= work.priority === 'interactive';
    this.automaticAttempts = 0;
    this.followup.admit(scope, kind);
    this.updates.request(update);
  }
  startRefresh(): void {
    this.followup.reset();
    this.receiptProjectionPending = false;
    this.interactiveChange = false;
    this.updates.clear();
    this.lastTransferAttempt = Date.now();
  }
  reset(): void {
    this.followup.reset();
    this.receiptFailed = false;
    this.interactiveChange = false;
    this.visibleChange = null;
    this.receiptProjectionPending = false;
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
  open(work: () => Promise<void>, reuse?: () => boolean): Promise<void> {
    if (this.closed) return Promise.resolve();
    const result = this.opening.request(work, reuse);
    void this.openNext();
    return result;
  }
  cancelOpening(): void {
    this.historyGeneration++;
    this.continuation.clear();
    this.opening.clear();
  }
  private async openNext(): Promise<void> {
    // Keep the latest choice replaceable while the current owner finishes.
    // Restoring a retained projection must not reserve the visible sync state.
    if (this.closed) return;
    if (this.restoreOpening()) return;
    await this.maintenance;
    if (this.closed || this.busy) return;
    const pending = this.opening.take();
    if (!pending) return;
    this.historyGeneration++;
    this.continuation.clear();
    const current = this.options.state().generation;
    try {
      if (pending.reuse()) {
        this.failed = false;
        this.options.status();
        this.resume();
      } else await this.run(pending.work);
    } catch (error: unknown) {
      if (this.current(current) && !expectedInterruption(error)) {
        this.failed = true;
        this.report(error, t('Could not complete the operation.'));
        this.options.status();
      }
    } finally {
      pending.done();
    }
  }
  private restoreOpening(): boolean {
    try {
      if (!this.opening.reuse()) return false;
      this.failed = false;
      this.options.status();
      this.resume();
    } catch (error: unknown) {
      this.opening.clear();
      if (!expectedInterruption(error)) {
        this.failed = true;
        this.report(error, t('Could not complete the operation.'));
        this.options.status();
      }
    }
    return true;
  }
  resumeHistory(): boolean {
    if (!this.continuation.waiting) return false;
    this.resume();
    return true;
  }
  get historyPending(): boolean {
    return this.continuation.waiting;
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
      this.continuation.waiting ||
      this.opening.waiting
    );
  }
  /** Queued/running visible verification takes precedence over list decoration. */
  get visibleUpdatePending(): boolean {
    return (
      this.options.state().visible &&
      (this.interactiveChange ||
        this.visibleChange !== null ||
        this.busy ||
        this.continuation.waiting ||
        this.opening.waiting)
    );
  }
  /** Decoration and speculative work also yield to runnable live receipt. */
  get backgroundReady(): boolean {
    return (
      this.canSynchronize() &&
      !this.updates.waiting &&
      !this.continuation.waiting &&
      !this.inbox.urgent
    );
  }
  async background(work: () => Promise<void>): Promise<void> {
    await this.maintain(work, (error) => {
      this.report(error, t('Could not complete the operation.'));
    });
  }
  async run(work: () => Promise<void>): Promise<boolean> {
    if (this.closed || this.busy) return false;
    this.busy = true;
    // A live receipt page commits first; speculative preparation is interrupted.
    const receipt = this.inbox.settle();
    this.failed = false;
    const current = this.options.state().generation;
    this.options.status();
    try {
      await receipt;
      // A user action waits for automatic maintenance instead of being dropped.
      await this.maintenance;
      if (!this.current(current)) return false;
      this.failed = false;
      await measureWork(this, 'foreground', work);
      if (!this.current(current)) return false;
      if (
        this.options.state().online &&
        !this.opening.waiting &&
        !this.continuation.waiting
      )
        this.options.complete();
      return true;
    } catch (error: unknown) {
      this.failCurrent(error, current);
      return false;
    } finally {
      await this.finishRun(current);
    }
  }
  /** Adopt a bounded read without replaying the enclosing user operation. */
  async history(
    work: MessageWork,
    settled?: () => Promise<void>,
  ): Promise<boolean> {
    const current = this.options.state().generation,
      history = this.historyGeneration;
    this.continuation.clear();
    const result = await (settled ? afterMessageWork(work, settled) : work());
    if (!this.current(current) || history !== this.historyGeneration) {
      result?.cancel();
      return false;
    }
    return this.acceptHistory(result);
  }
  private acceptHistory(result: MessageWorkResult): boolean {
    if (!result) return true;
    this.continuation.request(result);
    return false;
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
      !this.opening.waiting &&
      !this.inbox.running &&
      state.visible &&
      !state.textPending
    );
  }
  /** Live receipt waits only for an active owner or a requested opening. Send
   * quiet time, startup decoration and queued checks do not delay delivery. */
  private get receiptReady(): boolean {
    return (
      this.foregroundReady &&
      !this.opening.waiting &&
      this.options.state().visible
    );
  }
  get presentationReady(): boolean {
    const state = this.options.state();
    return !this.closed && state.session && state.online && !state.suspended;
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
  reuseDiagnostics() {
    const state = this.options.state();
    return {
      busy: this.busy,
      maintenance: this.maintenance !== null,
      session: state.session,
      online: state.online,
      suspended: state.suspended,
    };
  }
  private canPreload(): boolean {
    const state = this.options.state();
    return (
      this.backgroundReady &&
      !state.startupPending &&
      !this.continuation.waiting
    );
  }
  private async receivedPage(scope: HistoryKind): Promise<void> {
    if (this.visibleUpdatePending) {
      if (scope === 'direct') this.receiptProjectionPending = true;
      this.followup.counters(scope);
      return;
    }
    if (scope === 'groups') {
      await this.refreshGroups();
      return;
    }
    const generation = this.options.state().generation;
    await this.options.unread();
    if (this.current(generation)) this.completeReceipt();
  }
  private completeReceipt(): void {
    (this.options.receiptComplete ?? this.options.complete)();
  }
  private async refreshGroups(): Promise<void> {
    const work =
      this.options.groupProjection ?? this.options.changeMaintenance[1];
    await work();
  }
  private async refreshUnread(): Promise<void> {
    const generation = this.options.state().generation;
    await this.options.unread();
    if (!this.current(generation) || !this.receiptProjectionPending) return;
    this.receiptProjectionPending = false;
    this.completeReceipt();
  }
  private async checkChanges(
    work: VaultWorkOptions,
    plan: ChangeFollowupPlan,
  ): Promise<void> {
    const current = this.options.state().generation;
    const visible = work.priority === 'interactive' ? Symbol() : null;
    if (visible) this.visibleChange = visible;
    try {
      await this.checkAutomatically(
        async () => {
          await retrySnapshotRead(
            () => this.options.changes(work, plan.scope),
            () => this.current(current),
          );
          if (this.current(current)) this.followup.queue(plan);
        },
        plan.scope === 'all' ? 'full' : 'projection',
      );
    } finally {
      if (visible && this.visibleChange === visible) {
        this.visibleChange = null;
        if (this.current(current)) {
          this.options.visibleSettled?.();
          this.resume();
        }
      }
    }
  }

  /** Automatic reads share the maintenance lock. An interactive operation can
   * reserve busy and wait for them instead of being rejected as another sync. */
  private async checkAutomatically(
    work: () => Promise<void>,
    completion: 'full' | 'projection' = 'full',
  ): Promise<void> {
    const current = this.options.state().generation;
    await this.maintain(
      async () => {
        this.failed = false;
        await work();
        if (!this.current(current)) return;
        if (
          this.options.state().online &&
          completion === 'full' &&
          !this.continuation.waiting
        )
          this.options.complete();
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
        if (this.current(current))
          return measureWork(this, 'maintenance', work);
      })
      .catch((error: unknown) => {
        if (!this.current(current)) return;
        if (!expectedInterruption(error)) failure(error);
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
  private failCurrent(error: unknown, generation: number): void {
    if (!this.current(generation) || expectedInterruption(error)) return;
    this.failed = true;
    this.report(error, t('Could not complete the operation.'));
  }
  private report(error: unknown, fallback: string): void {
    if (expectedInterruption(error)) return;
    this.options.notice(
      error instanceof Error ? translatedError(error.message) : fallback,
    );
  }
}
