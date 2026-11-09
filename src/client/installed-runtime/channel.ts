import type {
  NativeApiRequest,
  NativeSessionBridge,
} from '../native-api/index.ts';
import { encode, keys, object, uuid } from '../../shared/account/index.ts';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
interface AndroidPort {
  postMessage: (message: string) => void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}
interface InstalledWindow extends Window {
  ZeroXSession?: AndroidPort;
  webkit?: {
    messageHandlers?: {
      zeroXSession?: { postMessage: (message: string) => Promise<unknown> };
    };
  };
}

function unavailable(): TypeError {
  return new TypeError('The installed app connection is unavailable.');
}

function channelReply(
  input: unknown,
): { call: string; value: unknown } | { call: string; error: true } {
  if (typeof input !== 'string' || input.length > 48_000) throw unavailable();
  const reply = object(JSON.parse(input) as unknown);
  const call = uuid(reply['call']);
  if (Object.hasOwn(reply, 'error')) {
    keys(reply, ['call', 'error']);
    if (reply['error'] !== true) throw unavailable();
    return { call, error: true };
  }
  keys(reply, ['call', 'value']);
  return { call, value: reply['value'] };
}

/** Owns only the guarded message channel and its bounded pending replies.
 * The native owner verifies this nonce against the current main document;
 * neither the nonce nor a JavaScript-provided origin grants session access.
 */
export class InstalledSessionChannel implements NativeSessionBridge {
  private readonly document = crypto.randomUUID();
  private readonly pending = new Map<string, Pending>();
  private readonly android: AndroidPort | undefined;
  private readonly ios: InstalledWindow['webkit'];
  private closed = false;

  constructor() {
    Object.defineProperty(window, '__zeroXSessionDocument', {
      value: this.document,
      writable: false,
      configurable: false,
    });
    const native = window as InstalledWindow;
    this.android = native.ZeroXSession;
    this.ios = native.webkit;
    if (this.android)
      this.android.onmessage = (event) => this.receive(event.data);
    if (!this.android && !this.ios?.messageHandlers?.zeroXSession)
      throw unavailable();
  }

  async ready(): Promise<void> {
    const deadline = performance.now() + 30_000;
    for (let attempt = 0; attempt < 120; attempt++) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw unavailable();
      const value = await this.call('hello', {}, Math.min(15_000, remaining));
      if (performance.now() >= deadline) throw unavailable();
      if (value === true) return;
      if (value !== false) throw unavailable();
      const delay = Math.min(250, deadline - performance.now());
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    throw unavailable();
  }

  open(request: NativeApiRequest): Promise<unknown> {
    const { body, ...head } = request;
    return this.call('open', {
      ...head,
      ...(body === undefined
        ? {}
        : { bodyBase64: encode(new TextEncoder().encode(body)) }),
    });
  }

  read(request: { id: string; bytes: number }): Promise<unknown> {
    return this.call('read', request);
  }

  async cancel(request: { id: string }): Promise<void> {
    const value = await this.call('cancel', request, 900);
    if (value !== null) throw unavailable();
  }

  async viewBegin(request: {
    id: string;
    mime: string;
    bytes: number;
  }): Promise<void> {
    if ((await this.call('view-begin', request)) !== true) throw unavailable();
  }
  async viewAppend(request: {
    id: string;
    offset: number;
    bytes: string;
  }): Promise<void> {
    if ((await this.call('view-append', request)) !== true) throw unavailable();
  }
  async viewShow(request: { id: string; text: string }): Promise<void> {
    if ((await this.call('view-show', request)) !== true) throw unavailable();
  }
  async viewActive(request: { id: string }): Promise<boolean> {
    const value = await this.call('view-active', request);
    if (typeof value !== 'boolean') throw unavailable();
    return value;
  }
  async viewClose(request: { id: string }): Promise<void> {
    if ((await this.call('view-close', request)) !== true) throw unavailable();
  }
  async downloadFile(input: {
    id: string;
    name: string;
    bytes: Uint8Array<ArrayBuffer>;
  }): Promise<void> {
    const { id, name, bytes } = input;
    try {
      if (
        (await this.call('file-begin', { id, name, bytes: bytes.length })) !==
        true
      )
        throw unavailable();
      for (let offset = 0; offset < bytes.length; offset += 64 * 1024)
        if (
          (await this.call('file-append', {
            id,
            offset,
            bytes: encode(bytes.subarray(offset, offset + 64 * 1024)),
          })) !== true
        )
          throw unavailable();
      if ((await this.call('file-save', { id })) !== true) throw unavailable();
    } catch (error: unknown) {
      await this.call('file-close', { id }).catch(() => undefined);
      throw error;
    }
  }
  private call(
    operation: string,
    request: object,
    timeout = 15_000,
  ): Promise<unknown> {
    if (this.closed || this.pending.size >= 24)
      return Promise.reject(unavailable());
    const call = crypto.randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(call), timeout);
      this.pending.set(call, { resolve, reject, timer });
      const message = JSON.stringify({
        call,
        document: this.document,
        operation,
        request,
      });
      try {
        this.send(message, call);
      } catch {
        this.fail(call);
      }
    });
  }

  private send(message: string, call: string): void {
    if (this.android) {
      this.android.postMessage(message);
      return;
    }
    const handler = this.ios?.messageHandlers?.zeroXSession;
    if (!handler) throw unavailable();
    void handler.postMessage(message).then(
      (value) => this.receive(value),
      () => this.fail(call),
    );
  }

  private receive(input: unknown): void {
    if (this.closed) return;
    try {
      const reply = channelReply(input);
      const call = reply.call;
      const pending = this.pending.get(call);
      if (!pending) return;
      if ('error' in reply) return this.fail(call);
      this.pending.delete(call);
      clearTimeout(pending.timer);
      pending.resolve(reply.value);
    } catch {
      this.close();
    }
  }

  private fail(call: string): void {
    const pending = this.pending.get(call);
    if (!pending) return;
    this.pending.delete(call);
    clearTimeout(pending.timer);
    pending.reject(unavailable());
  }

  close(): void {
    this.closed = true;
    if (this.android) this.android.onmessage = null;
    for (const call of this.pending.keys()) this.fail(call);
  }
}
