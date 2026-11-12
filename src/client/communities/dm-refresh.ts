import { networkAvailable } from '../connectivity/index.ts';
import {
  LiveMessages,
  LiveUpdates,
  scopedLiveEvent,
} from '../message-live/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { DmContinuations } from './dm-continuation.ts';
import { bindDmLifecycle } from './dm-lifecycle.ts';
import {
  chatSyncActive,
  traceChatSync,
} from '../chat-sync-diagnostics/index.ts';
import type { ChatSyncReason } from '../../shared/chat-sync-diagnostics/index.ts';

interface RefreshOptions {
  access: VaultAccess;
  state: () => Readonly<{
    signedIn: boolean;
    mounted: boolean;
    directory: boolean;
    busy: boolean;
    composing: boolean;
  }>;
  reload: () => void;
  receipts: () => void;
  invalidate: () => void;
  forget: () => void;
  clearDirectory: () => void;
}

/** Owns live hints, bounded wakeup/continuation scheduling and browser/poll
 * subscriptions. The shell remains the authority that closes unusable content. */
export class DmRefresh {
  private readonly options: RefreshOptions;
  private readonly live: LiveMessages;
  private readonly refreshes: LiveUpdates;
  private readonly continuations: DmContinuations;
  private streamCurrent = false;
  private fallback: ReturnType<typeof setInterval> | null = null;
  private stopLifecycle: (() => void) | null = null;
  private lastWait = '';
  constructor(options: RefreshOptions) {
    this.options = options;
    this.live = new LiveMessages({
      access: options.access,
      event: (signal) => {
        const event = scopedLiveEvent(signal, [
          'handle-messages',
          'handle-receipts',
        ]);
        if (!event || event === 'call') return;
        const state = options.state();
        if (!state.mounted && !state.directory) return;
        if (
          [
            'removed',
            'authorization',
            'invalidated',
            'revoked',
            'ended',
          ].includes(event)
        )
          options.invalidate();
        if (signal === 'handle-receipts') this.refreshes.request('probe');
        else if (signal === 'handle-messages') this.requestRead('live-hint');
        else this.refreshes.request();
      },
      changed: () => {
        const current = this.live.current;
        if (this.streamCurrent && !current) {
          options.invalidate();
          this.requestRead('live-disconnected');
        }
        this.streamCurrent = current;
        this.refreshes.resume();
      },
    });
    this.continuations = new DmContinuations({
      available: () =>
        options.state().signedIn && this.available() && networkAvailable(),
      run: () => {
        this.traceRead('continuation');
        options.reload();
      },
    });
    this.refreshes = new LiveUpdates({
      available: () => this.available(),
      run: (update) => {
        if (update === 'probe') options.receipts();
        else {
          this.traceRead('refresh-start');
          options.reload();
        }
      },
    });
  }
  get current(): boolean {
    return this.live.current;
  }
  private available(): boolean {
    const state = this.options.state();
    return (
      (state.mounted || state.directory) &&
      document.visibilityState === 'visible' &&
      !state.busy &&
      !state.composing &&
      !this.live.connecting
    );
  }
  watch(): void {
    this.stopLifecycle ??= bindDmLifecycle({
      current: () => this.live.current,
      pause: this.options.invalidate,
      refresh: () => this.refreshes.request(),
      reconnect: () => this.live.retry(),
      visible: () => this.refreshes.resume(),
    });
  }
  connect(): void {
    this.live.start();
    this.startFallback();
  }
  watchDirectory(): void {
    this.live.start();
    this.watch();
    this.startFallback();
  }
  private startFallback(): void {
    if (this.fallback !== null) return;
    this.fallback = setInterval(() => {
      if (this.closeIdleDirectory()) return;
      const state = this.options.state();
      if (
        (!state.mounted && !state.directory) ||
        state.busy ||
        state.composing ||
        this.live.connected ||
        document.visibilityState !== 'visible'
      )
        return;
      this.requestRead('fallback-poll');
    }, 30000);
  }
  private closeIdleDirectory(): boolean {
    const state = this.options.state();
    if (state.mounted || state.directory) return false;
    this.options.clearDirectory();
    this.stop();
    return true;
  }
  private stop(): void {
    this.stopLifecycle?.();
    this.stopLifecycle = null;
    this.live.stop();
    if (this.fallback) clearInterval(this.fallback);
    this.fallback = null;
  }
  leave(): void {
    if (this.options.state().directory) return;
    this.options.forget();
    this.streamCurrent = false;
    this.stop();
  }
  requestContinuation(): void {
    this.continuations.request();
  }
  requestContent(): void {
    this.requestRead('pending-confirmation');
  }
  private requestRead(reason: ChatSyncReason): void {
    this.lastWait = '';
    this.traceRead(reason);
    this.refreshes.request();
  }
  private traceRead(reason: ChatSyncReason): void {
    if (!chatSyncActive()) return;
    const state = this.options.state();
    const fields = {
      connected: this.live.connected,
      busy: state.busy,
      handleVisible: document.visibilityState === 'visible',
      handleComposing: state.composing,
      handleConnecting: this.live.connecting,
    };
    if (reason === 'refresh-wait') {
      const key = JSON.stringify(fields);
      if (key === this.lastWait) return;
      this.lastWait = key;
    }
    traceChatSync(this, null, { event: 'handle-refresh', reason, ...fields });
  }
  clearContinuation(): void {
    this.continuations.clear();
  }
  resume(): void {
    this.resumeRefresh();
    this.continuations.resume();
  }
  resumeRefresh(): void {
    if (this.refreshes.waiting) this.traceRead('refresh-wait');
    this.refreshes.resume();
  }
  clear(): void {
    this.continuations.clear();
    this.refreshes.clear();
  }
}
