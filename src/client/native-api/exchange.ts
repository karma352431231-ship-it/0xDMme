import {
  chunkBytes,
  nativeFailure,
  responseBytes,
  responseChunk,
  responseHead,
} from './protocol.ts';
import type { NativeApiRequest, NativeSessionBridge } from './protocol.ts';

function aborted(): DOMException {
  return new DOMException('Native API request cancelled.', 'AbortError');
}

/** Observe even late rejections; release every timer/listener on all outcomes. */
function bounded<T>(
  operation: () => Promise<T>,
  input: { signal?: AbortSignal; ms: number },
): Promise<T> {
  return new Promise((resolve, reject) => {
    const signal = input.signal;
    let settled = false;
    const timer = setTimeout(
      () =>
        finish(
          new DOMException('Native API deadline exceeded.', 'TimeoutError'),
        ),
      input.ms,
    );
    const abort = () => finish(aborted());
    function finish(error?: Error, value?: T): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(value as T);
    }
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) return abort();
    // The call may throw synchronously instead of returning its declared promise.
    Promise.resolve()
      .then(operation)
      .then(
        (value) => finish(undefined, value),
        () => finish(nativeFailure()),
      );
  });
}

/** One exchange owns body demand, cancellation and native-handle disposal. */
export class NativeExchange {
  private readonly bridge: NativeSessionBridge;
  private readonly request: NativeApiRequest;
  private readonly released: (clean: boolean) => void;
  private readonly abort = new AbortController();
  private readonly caller: AbortSignal | null | undefined;
  private stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private closing: Promise<void> | undefined;
  private ended = false;
  private received = 0;
  private expected: number | null = null;
  private live = false;

  constructor(input: {
    bridge: NativeSessionBridge;
    request: NativeApiRequest;
    signal: AbortSignal | null | undefined;
    released: (clean: boolean) => void;
  }) {
    this.bridge = input.bridge;
    this.request = input.request;
    this.released = input.released;
    this.caller = input.signal;
    this.caller?.addEventListener('abort', this.onAbort, { once: true });
  }

  private readonly onAbort = (): void => {
    void this.cancel(aborted());
  };

  async response(): Promise<Response> {
    try {
      if (this.caller?.aborted) throw aborted();
      const raw = await bounded(() => this.bridge.open(this.request), {
        signal: this.abort.signal,
        ms: 15000,
      });
      if (this.ended) throw aborted();
      const head = this.acceptHead(raw);
      if (this.request.method === 'HEAD' || [204, 205].includes(head.status)) {
        await this.cancel();
        return new Response(null, head);
      }
      const body = new ReadableStream<Uint8Array>(
        {
          start: (controller) => {
            this.stream = controller;
            this.armIdle();
          },
          pull: () => this.read(),
          cancel: () => this.cancel(),
        },
        { highWaterMark: 0 },
      );
      return new Response(body, head);
    } catch (error: unknown) {
      await this.cancel(error);
      throw error;
    }
  }

  private acceptHead(raw: unknown): ReturnType<typeof responseHead> {
    const head = responseHead(raw);
    this.expected = head.headers.has('content-length')
      ? Number(head.headers.get('content-length'))
      : null;
    this.live =
      [
        '/api/account/messages/live',
        '/api/communities/ranking-events',
      ].includes(this.request.path.split('?')[0] ?? '') &&
      head.headers.get('content-type')?.split(';')[0]?.trim() ===
        'text/event-stream';
    return head;
  }

  private armIdle(): void {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      void this.cancel(
        new DOMException('Native API body was not consumed.', 'TimeoutError'),
      );
    }, 30000);
  }

  private async read(): Promise<void> {
    if (this.ended) return;
    clearTimeout(this.idle);
    try {
      const maximum = this.live ? 4096 : chunkBytes;
      const raw = await bounded(
        () => this.bridge.read({ id: this.request.id, bytes: maximum }),
        {
          signal: this.abort.signal,
          ms: 15000,
        },
      );
      if (this.ended) return;
      const { done, bytes } = responseChunk(raw, maximum);
      this.account(bytes.length, done);
      if (bytes.length) this.stream?.enqueue(bytes);
      if (done) {
        this.stream?.close();
        this.finish();
      } else this.armIdle();
    } catch (error: unknown) {
      await this.cancel(error);
    }
  }

  private account(size: number, done: boolean): void {
    this.received += size;
    if (!this.live && this.received > responseBytes) throw nativeFailure();
    if (this.expected === null) return;
    if (
      this.received > this.expected ||
      (done && this.received !== this.expected)
    )
      throw nativeFailure();
  }

  private detach(): void {
    this.ended = true;
    clearTimeout(this.idle);
    this.caller?.removeEventListener('abort', this.onAbort);
    this.abort.abort();
  }

  private finish(): void {
    this.detach();
    this.released(true);
  }

  cancel(error?: unknown): Promise<void> {
    if (this.closing) return this.closing;
    if (this.ended) return Promise.resolve();
    this.detach();
    // A consumer cancel already closes its stream. Errors also reject pending reads.
    if (error !== undefined) this.stream?.error(error);
    this.closing = bounded(() => this.bridge.cancel({ id: this.request.id }), {
      ms: 1000,
    }).then(
      () => this.released(true),
      () => this.released(false),
    );
    return this.closing;
  }
}
