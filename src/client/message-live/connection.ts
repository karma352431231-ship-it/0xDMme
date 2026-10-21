import { t, translatedError } from '../../shared/i18n/index.ts';
import { AccountError } from '../../shared/account/index.ts';
import { ApiResponseError, readApiJson } from '../api-response/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { WakeupFrames, terminalLiveEvent } from './protocol.ts';
import type { LiveEvent, LivePhase, LiveSnapshot } from './protocol.ts';
import type { LiveSession } from './session.ts';
import { LiveRequest } from './request.ts';
export class LiveConnection {
  private readonly access: VaultAccess;
  private readonly event: (event: LiveEvent) => void;
  private readonly changed: () => void;
  private readonly pulse: () => void;
  private readonly session: LiveSession | undefined;
  private readonly request = new LiveRequest();
  phase: LivePhase = 'paused';
  get snapshot(): LiveSnapshot {
    return { phase: this.phase, activity: this.lastActivity };
  }
  private wanted = false;
  private generation = 0;
  private attempts = 0;
  private readyAt = 0;
  private lastActivity: number | null = null;
  private connection: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  connected = false;
  /** Timers can be delayed by a suspended browser. Check wall-clock freshness
   * before retaining the view or accepting another frame from this stream. */
  get current(): boolean {
    if (!this.connected || this.lastActivity === null) return false;
    const age = Date.now() - this.lastActivity;
    return age >= 0 && age < 15000;
  }
  /** A foreground refresh waits for this handshake so ready cannot invalidate
   * a read started by the same resume. Failure releases the polling fallback. */
  get connecting(): boolean {
    return this.wanted && this.connection !== null && !this.connected;
  }
  notice = t('Live updates available after authorizing the device.');
  constructor(options: {
    access: VaultAccess;
    event: (event: LiveEvent) => void;
    changed: () => void;
    pulse?: () => void;
    session?: LiveSession;
  }) {
    this.access = options.access;
    this.event = options.event;
    this.changed = options.changed;
    this.pulse = options.pulse ?? (() => {});
    this.session = options.session;
  }
  start(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.attempts = 0;
    this.connect();
  }
  retry(): void {
    this.stop();
    this.start();
  }
  stop(): void {
    this.generation++;
    this.wanted = false;
    this.connected = false;
    this.lastActivity = null;
    this.connection?.abort();
    this.connection = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.phase = 'paused';
    this.notice = t(
      'Live updates paused. The app checks the current state when you return.',
    );
    this.changed();
  }
  private connect(): void {
    if (!this.wanted || this.connection) return;
    const generation = this.generation,
      controller = new AbortController();
    this.readyAt = 0;
    this.lastActivity = null;
    this.connection = controller;
    this.attempts++;
    this.phase = 'connecting';
    this.notice = t('Connecting live updates…');
    this.changed();
    void this.consume(controller, generation)
      .catch((error: unknown) => {
        if (generation !== this.generation) return;
        if (
          error instanceof AccountError &&
          [401, 403].includes(error.status)
        ) {
          // A 403 can mean a directory changed after signing, not a revoked device.
          // Reconcile authority without cutting an already opened voice message.
          this.receiveEvent(error.status === 401 ? 'ended' : 'invalidated');
          return;
        }
        this.phase = 'unavailable';
        this.notice =
          (error instanceof ApiResponseError
            ? translatedError(error.message) + ' '
            : '') +
          t(
            'Live updates unavailable. The app keeps checking every 30 seconds; you can also sync.',
          );
      })
      .finally(() => {
        if (generation !== this.generation) return;
        if (this.readyAt && Date.now() - this.readyAt >= 30000)
          this.attempts = 0;
        this.connection = null;
        this.connected = false;
        this.changed();
        if (this.wanted && this.attempts < 3)
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.connect();
          }, this.attempts * 3000);
      });
  }
  private async consume(
    controller: AbortController,
    generation: number,
  ): Promise<void> {
    let watchdog = setTimeout(() => controller.abort(), 15000);
    const reset = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => controller.abort(), 15000);
    };
    try {
      const response = await this.request.open({
        access: this.access,
        session: this.session,
        signal: controller.signal,
        current: () => generation === this.generation,
      });
      if (!response.ok) await readApiJson(response, 'messages/live');
      if (
        !response.ok ||
        !response.headers.get('content-type')?.startsWith('text/event-stream')
      )
        throw new Error('Live updates unavailable.');
      if (!response.body) throw new Error('Live updates unresponsive.');
      await this.read(response.body, { generation, reset });
      if (this.wanted) throw new Error('Live updates ended.');
    } finally {
      clearTimeout(watchdog);
      controller.abort();
    }
  }
  private receiveEvent(event: LiveEvent): void {
    if (event === 'ready') {
      this.lastActivity = Date.now();
      this.connected = true;
      this.readyAt = Date.now();
      this.phase = 'connected';
      this.notice = t('Live updates connected.');
      this.changed();
    }
    if (terminalLiveEvent(event)) {
      this.phase = 'authorization';
      this.wanted = false;
      this.connected = false;
      this.notice = t(
        "Authorization changed. The app is checking the device's current state.",
      );
      this.changed();
    }
    this.event(event);
  }
  private receiveFrames(events: LiveEvent[], generation: number): void {
    for (const event of events) {
      if (!this.wanted || generation !== this.generation) return;
      this.receiveEvent(event);
    }
  }
  private async read(
    body: ReadableStream<Uint8Array>,
    context: { generation: number; reset: () => void },
  ): Promise<void> {
    const reader = body.getReader(),
      parser = new WakeupFrames();
    try {
      while (this.wanted && context.generation === this.generation) {
        const { value, done } = await reader.read();
        if (done || context.generation !== this.generation) return;
        if (this.connected && !this.current)
          throw new Error('Receiving was interrupted while suspended.');
        const events = parser.accept(value);
        this.lastActivity = Date.now();
        context.reset();
        this.receiveFrames(events, context.generation);
        this.pulse();
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
