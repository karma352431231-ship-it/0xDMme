import { AccountError } from '../../shared/account/index.ts';
import { t } from '../../shared/i18n/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { LiveConnection } from './connection.ts';
import { liveHandshakeWork } from './request.ts';
import { liveCurrent, terminalLiveEvent } from './protocol.ts';
import type { LiveEvent, LivePhase, LiveSnapshot } from './protocol.ts';
import { liveScope } from './session.ts';
import type { LiveSession } from './session.ts';
import { liveSignal } from './signals.ts';
import type { LiveSignal } from './signals.ts';

interface SharedOptions {
  access: VaultAccess;
  event: (event: LiveEvent) => void;
  changed: () => void;
}
function liveNotice(phase: LivePhase): string {
  switch (phase) {
    case 'paused':
      return t(
        'Live updates paused. The app checks the current state when you return.',
      );
    case 'connecting':
      return t('Connecting live updates…');
    case 'connected':
      return t('Live updates connected.');
    case 'unavailable':
      return t(
        'Live updates unavailable. The app keeps checking every 30 seconds; you can also sync.',
      );
    case 'authorization':
      return t(
        "Authorization changed. The app is checking the device's current state.",
      );
  }
}

/** Web Locks owns the stream, never the vault. Peers have no participant registry,
 * payload cache or authority: every ready/event still triggers their signed checks. */
export class SharedLiveConnection {
  private readonly options: SharedOptions;
  private snapshot: LiveSnapshot = { phase: 'paused', activity: null };
  private wanted = false;
  private generation = 0;
  private channel: BroadcastChannel | null = null;
  private queue: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private release: (() => void) | null = null;
  private source: LiveConnection | null = null;
  private owner: string | null = null;
  private previousOwner: string | null = null;
  private challenge = crypto.randomUUID();
  private sequence = 0;
  private received = 0;
  private welcoming = true;
  private waitingAt = 0;
  private retryRequested = false;
  private attempts = 0;
  constructor(options: SharedOptions) {
    this.options = options;
  }
  get current(): boolean {
    return this.source?.current ?? liveCurrent(this.snapshot);
  }
  get connected(): boolean {
    return this.snapshot.phase === 'connected';
  }
  get connecting(): boolean {
    return this.wanted && this.snapshot.phase === 'connecting';
  }
  get notice(): string {
    return liveNotice(this.snapshot.phase);
  }
  start(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.attempts = 0;
    this.snapshot = { phase: 'connecting', activity: null };
    this.waitingAt = Date.now();
    this.options.changed();
    this.initialize(this.generation);
  }
  retry(): void {
    this.stop();
    this.retryRequested = true;
    this.start();
  }
  stop(): void {
    this.shutdown();
    this.snapshot = { phase: 'paused', activity: null };
    this.options.changed();
  }
  private shutdown(): void {
    this.generation++;
    this.wanted = false;
    this.retryRequested = false;
    if (this.timer !== null) clearInterval(this.timer);
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.timer = null;
    this.retryTimer = null;
    this.channel?.close();
    this.channel = null;
    this.queue?.abort();
    this.queue = null;
    this.source?.stop();
    this.source = null;
    this.release?.();
    this.release = null;
    this.owner = null;
    this.previousOwner = null;
    this.received = 0;
    this.welcoming = true;
    this.challenge = crypto.randomUUID();
  }
  private initialize(generation: number): void {
    this.attempts++;
    void this.join(generation).catch((error: unknown) => {
      if (generation !== this.generation) return;
      if (error instanceof AccountError && [401, 403].includes(error.status)) {
        this.deliver(error.status === 401 ? 'ended' : 'invalidated');
        return;
      }
      this.snapshot = { phase: 'unavailable', activity: null };
      this.options.changed();
      if (this.attempts < 3)
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.initialize(generation);
        }, this.attempts * 3000);
    });
  }
  private async join(generation: number): Promise<void> {
    const session = await this.options.access.withVault(
      false,
      (a) => Promise.resolve({ ...a.session }),
      liveHandshakeWork(),
    );
    const scope = await liveScope(session);
    if (generation !== this.generation) return;
    this.channel = new BroadcastChannel(scope);
    this.channel.onmessage = (event: MessageEvent<unknown>) =>
      this.receive(event.data);
    this.timer = setInterval(() => this.tick(), 5000);
    this.queue = new AbortController();
    // A queued request does not hold a lock or a signed authority operation.
    void navigator.locks
      .request(scope, { signal: this.queue.signal }, async () => {
        if (generation !== this.generation) return;
        await new Promise<void>((resolve) => {
          this.release = resolve;
          this.lead(session);
        });
      })
      .catch((error: unknown) => {
        if (generation !== this.generation) return;
        this.shutdown();
        this.snapshot = { phase: 'unavailable', activity: null };
        this.options.changed();
        if (error instanceof AccountError) this.options.event('invalidated');
      });
    this.hello();
  }
  private lead(session: LiveSession): void {
    this.previousOwner = this.owner;
    this.owner = crypto.randomUUID();
    this.sequence = 0;
    this.source = new LiveConnection({
      access: this.options.access,
      session,
      changed: () => this.sourceChanged(),
      pulse: () => this.publish(),
      event: (event) => {
        this.publish(event);
        this.deliver(event);
      },
    });
    this.channel?.postMessage({
      kind: 'owner',
      owner: this.owner,
    } satisfies LiveSignal);
    this.source.start();
  }
  private sourceChanged(): void {
    if (!this.wanted || !this.source) return;
    this.snapshot = this.source.snapshot;
    // Connected is relayed with ready in one packet, avoiding an inter-message
    // window that could release a follower's read before its fresh-state hint.
    if (this.source.phase !== 'connected') this.publish();
    this.options.changed();
  }
  private publish(event?: LiveEvent, peer?: string): void {
    if (!this.wanted || !this.source || !this.owner) return;
    const message: LiveSignal = {
      kind: 'state',
      owner: this.owner,
      sequence: ++this.sequence,
      sentAt: Date.now(),
      snapshot: this.source.snapshot,
      ...(event === undefined ? {} : { event }),
      ...(peer === undefined ? {} : { peer }),
    };
    this.channel?.postMessage(message);
  }
  private receive(value: unknown): void {
    if (!this.wanted) return;
    const message = liveSignal(value);
    if (!message || this.receiveTerminal(message)) return;
    if (message.kind === 'hello') {
      this.receiveHello(message);
      return;
    }
    if (this.source) return;
    if (message.kind === 'owner') {
      if (this.owner !== null || !this.connecting) this.forgetOwner();
      this.hello();
      return;
    }
    this.receiveState(message);
  }
  /** A terminal frame can race the lock handoff. The previous owner's terminal
   * hint still fails closed in this same session; it cannot authorize anything. */
  private receiveTerminal(message: LiveSignal): boolean {
    if (message.kind !== 'state' || message.event === undefined) return false;
    if (!terminalLiveEvent(message.event)) return false;
    if (message.owner !== this.owner && message.owner !== this.previousOwner)
      return false;
    const age = Date.now() - message.sentAt;
    if (age < 0 || age >= 15000) return false;
    this.deliver(message.event);
    return true;
  }
  private receiveHello(message: Extract<LiveSignal, { kind: 'hello' }>): void {
    if (
      message.retry &&
      this.source &&
      !this.source.current &&
      !this.source.connecting
    )
      this.source.retry();
    this.publish(undefined, message.peer);
  }
  private acceptsState(
    message: Extract<LiveSignal, { kind: 'state' }>,
    welcome: boolean,
  ): boolean {
    const age = Date.now() - message.sentAt;
    if (age < 0 || age >= 15000) return false;
    if (message.peer !== undefined) return welcome;
    return message.owner === this.owner && message.sequence > this.received;
  }
  private receiveState(message: Extract<LiveSignal, { kind: 'state' }>): void {
    const welcome = this.welcoming && message.peer === this.challenge;
    if (!this.acceptsState(message, welcome)) return;
    if (!welcome && this.connected && !this.current) {
      this.forgetOwner();
      this.hello();
      return;
    }
    this.applyState(message, welcome);
  }
  private applyState(
    message: Extract<LiveSignal, { kind: 'state' }>,
    welcome: boolean,
  ): void {
    if (this.needsReady(message, welcome)) {
      this.forgetOwner();
      this.hello();
      return;
    }
    this.welcoming = false;
    this.owner = message.owner;
    this.received = message.sequence;
    this.snapshot = message.snapshot;
    if (this.connected && !this.current)
      this.snapshot = { phase: 'unavailable', activity: null };
    this.options.changed();
    if (message.event !== undefined) this.deliver(message.event);
    else if (welcome && this.current) this.deliver('ready');
  }
  private needsReady(
    message: Extract<LiveSignal, { kind: 'state' }>,
    welcome: boolean,
  ): boolean {
    return (
      message.snapshot.phase === 'connected' &&
      !this.current &&
      !welcome &&
      message.event !== 'ready'
    );
  }
  private deliver(event: LiveEvent): void {
    if (terminalLiveEvent(event)) {
      this.shutdown();
      this.snapshot = { phase: 'authorization', activity: null };
      this.options.changed();
    }
    this.options.event(event);
  }
  private forgetOwner(): void {
    if (this.owner !== null) this.previousOwner = this.owner;
    this.owner = null;
    this.received = 0;
    this.welcoming = true;
    this.challenge = crypto.randomUUID();
    this.snapshot = { phase: 'unavailable', activity: null };
    this.options.changed();
  }
  private hello(): void {
    this.channel?.postMessage({
      kind: 'hello',
      peer: this.challenge,
      retry: this.retryRequested,
    } satisfies LiveSignal);
    this.retryRequested = false;
  }
  private tick(): void {
    if (this.source) return;
    if (this.connected && !this.current) this.forgetOwner();
    if (this.connecting && Date.now() - this.waitingAt >= 15000)
      this.forgetOwner();
    if (this.owner === null) this.hello();
  }
}
