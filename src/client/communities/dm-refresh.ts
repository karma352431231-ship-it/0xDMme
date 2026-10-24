import {
  LiveMessages,
  LiveUpdates,
  scopedLiveEvent,
} from '../message-live/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { DmContinuations } from './dm-continuation.ts';
import { bindDmLifecycle } from './dm-lifecycle.ts';

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
        this.refreshes.request();
      },
      changed: () => {
        const current = this.live.current;
        if (this.streamCurrent && !current) {
          options.invalidate();
          this.refreshes.request();
        }
        this.streamCurrent = current;
        this.refreshes.resume();
      },
    });
    this.continuations = new DmContinuations({
      available: () =>
        options.state().signedIn && this.available() && navigator.onLine,
      run: options.reload,
    });
    this.refreshes = new LiveUpdates({
      available: () => this.available(),
      run: options.reload,
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
      this.refreshes.request();
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
  clearContinuation(): void {
    this.continuations.clear();
  }
  resume(): void {
    this.refreshes.resume();
    this.continuations.resume();
  }
  resumeRefresh(): void {
    this.refreshes.resume();
  }
  clear(): void {
    this.continuations.clear();
    this.refreshes.clear();
  }
}
