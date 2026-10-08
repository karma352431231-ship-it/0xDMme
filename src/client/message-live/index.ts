import { AccountError } from '../../shared/account/index.ts';
import {
  ApiResponseError,
  fetchApi,
  readApiJson,
} from '../api-response/index.ts';
import { prepareMessageRequest } from '../message-api/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
export type LiveEvent =
  | 'ready'
  | 'changed'
  | 'removed'
  | 'authorization'
  | 'invalidated'
  | 'revoked'
  | 'ended';
export type LiveUpdate = 'probe' | 'refresh';

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

export class WakeupFrames {
  private readonly decoder = new TextDecoder('utf-8', { fatal: true });
  private buffer = '';
  accept(bytes: Uint8Array): LiveEvent[] {
    if (bytes.length > 4096) throw new Error('Aviso de atualização excedido.');
    this.buffer += this.decoder.decode(bytes, { stream: true });
    const frames = this.buffer.split('\n\n');
    this.buffer = frames.pop() ?? '';
    if (this.buffer.length > 128)
      throw new Error('Aviso de atualização incompleto.');
    return frames.flatMap((frame) => {
      if (frame === ': heartbeat') return [];
      const match =
        /^event: (ready|changed|removed|authorization|invalidated|revoked|ended)\ndata: \{\}$/u.exec(
          frame,
        );
      if (!match) throw new Error('Aviso de atualização inválido.');
      return [match[1] as LiveEvent];
    });
  }
}
export class LiveMessages {
  private readonly access: VaultAccess;
  private readonly event: (event: LiveEvent) => void;
  private readonly changed: () => void;
  private wanted = false;
  private generation = 0;
  private attempts = 0;
  private readyAt = 0;
  private connection: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  connected = false;
  notice = 'Atualização imediata disponível após autorizar o aparelho.';
  constructor(options: {
    access: VaultAccess;
    event: (event: LiveEvent) => void;
    changed: () => void;
  }) {
    this.access = options.access;
    this.event = options.event;
    this.changed = options.changed;
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
    this.connection?.abort();
    this.connection = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.notice =
      'Recebimento em tempo real pausado. Ao retornar, o app confere o estado atual.';
    this.changed();
  }
  private connect(): void {
    if (!this.wanted || this.connection) return;
    const generation = this.generation,
      controller = new AbortController();
    this.readyAt = 0;
    this.connection = controller;
    this.attempts++;
    this.notice = 'Conectando recebimento em tempo real…';
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
        this.notice =
          (error instanceof ApiResponseError ? error.message + ' ' : '') +
          'Recebimento em tempo real indisponível. O app continua conferindo a cada 30 segundos; você também pode sincronizar.';
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
    // Only prepare the signed request inside the vault lock. Never hold it for the stream's lifetime.
    const request = await this.access.withVault(false, (a) =>
      prepareMessageRequest(a, 'live', {}),
    );
    if (generation !== this.generation) return;
    let watchdog = setTimeout(() => controller.abort(), 15000);
    const reset = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => controller.abort(), 15000);
    };
    try {
      const response = await fetchApi(
        'messages/live',
        '/api/account/messages/live',
        {
          ...request,
          signal: controller.signal,
        },
      );
      if (!response.ok) await readApiJson(response, 'messages/live');
      if (
        !response.ok ||
        !response.headers.get('content-type')?.startsWith('text/event-stream')
      )
        throw new Error('Recebimento em tempo real indisponível.');
      if (!response.body)
        throw new Error('Recebimento em tempo real sem resposta.');
      await this.read(response.body, { generation, reset });
      if (this.wanted) throw new Error('Recebimento em tempo real encerrado.');
    } finally {
      clearTimeout(watchdog);
      controller.abort();
    }
  }
  private receiveEvent(event: LiveEvent): void {
    if (event === 'ready') {
      this.connected = true;
      this.readyAt = Date.now();
      this.notice = 'Recebimento em tempo real conectado.';
      this.changed();
    }
    if (['invalidated', 'revoked', 'ended'].includes(event)) {
      this.wanted = false;
      this.connected = false;
      this.notice =
        'A autorização mudou. O app confere o estado atual do aparelho.';
      this.changed();
    }
    this.event(event);
  }
  private async read(
    body: ReadableStream<Uint8Array>,
    context: { generation: number; reset: () => void },
  ): Promise<void> {
    const reader = body.getReader(),
      parser = new WakeupFrames();
    try {
      while (context.generation === this.generation) {
        const { value, done } = await reader.read();
        if (done || context.generation !== this.generation) return;
        context.reset();
        for (const event of parser.accept(value)) {
          this.receiveEvent(event);
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
