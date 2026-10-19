import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { LiveEvent } from './protocol.ts';
import { LiveConnection } from './connection.ts';
import { SharedLiveConnection } from './shared.ts';
export { WakeupFrames } from './protocol.ts';
export type { LiveEvent, LiveUpdate } from './protocol.ts';
import type { LiveUpdate } from './protocol.ts';

/** Account rechecks do not replace entering a chat or reconnecting SSE.
 * Notify messages once per authorized session, even when opening the private
 * profile calls connection() several times during the same recheck. */
export class MessageReadiness {
  private current: Pick<
    AccountSession,
    'accountId' | 'deviceId' | 'csrf'
  > | null = null;
  update(session: AccountSession | null, authorized: boolean): boolean {
    if (!session || !authorized) {
      this.current = null;
      return false;
    }
    const previous = this.current;
    this.current = {
      accountId: session.accountId,
      deviceId: session.deviceId,
      csrf: session.csrf,
    };
    return (
      previous?.accountId !== session.accountId ||
      previous.deviceId !== session.deviceId ||
      previous.csrf !== session.csrf
    );
  }
}

/** One bounded wakeup window, one pending update. Invalidations happen at the
 * caller immediately; only the subsequent network work is coalesced. */
export class LiveUpdates {
  private pending: LiveUpdate | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly available: () => boolean;
  private readonly run: (update: LiveUpdate) => void;
  constructor(options: {
    available: () => boolean;
    run: (update: LiveUpdate) => void;
  }) {
    this.available = options.available;
    this.run = options.run;
  }
  get waiting(): boolean {
    return this.pending !== null;
  }
  request(update: LiveUpdate = 'refresh'): void {
    if (this.pending !== 'refresh') this.pending = update;
    this.resume();
  }
  resume(): void {
    if (this.timer !== null || this.pending === null || !this.available())
      return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.available() || this.pending === null) return;
      const update = this.pending;
      this.pending = null;
      this.run(update);
    }, 150);
  }
  clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}

/** Browser tabs share one transport; non-browser consumers retain the native connection. */
export class LiveMessages {
  private readonly transport: LiveConnection | SharedLiveConnection;
  constructor(options: {
    access: VaultAccess;
    event: (event: LiveEvent) => void;
    changed: () => void;
  }) {
    this.transport =
      typeof window !== 'undefined' &&
      typeof BroadcastChannel !== 'undefined' &&
      typeof navigator.locks !== 'undefined'
        ? new SharedLiveConnection(options)
        : new LiveConnection(options);
  }
  get current(): boolean {
    return this.transport.current;
  }
  get connected(): boolean {
    return this.transport.connected;
  }
  get connecting(): boolean {
    return this.transport.connecting;
  }
  get notice(): string {
    return this.transport.notice;
  }
  start(): void {
    this.transport.start();
  }
  retry(): void {
    this.transport.retry();
  }
  stop(): void {
    this.transport.stop();
  }
}
