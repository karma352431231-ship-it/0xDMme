import type {
  NativeApiRequest,
  NativeSessionBridge,
} from '../../src/client/native-api/index.ts';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function chunk(text: string, done = false) {
  return { data: Buffer.from(text).toString('base64'), done };
}

/** Controllable bridge replies only; no network, cookies or transport policy. */
export class FixtureBridge implements NativeSessionBridge {
  head: unknown = {
    status: 200,
    headers: { 'content-type': 'application/json' },
  };
  chunks: unknown[] = [];
  readonly opened: NativeApiRequest[] = [];
  readonly reads: { id: string; bytes: number }[] = [];
  readonly cancelled: string[] = [];
  openReply: Promise<unknown> | undefined;
  readReply: Promise<unknown> | undefined;
  cancelReply: Promise<void> | undefined;
  open(request: NativeApiRequest): Promise<unknown> {
    this.opened.push(request);
    return this.openReply ?? Promise.resolve(this.head);
  }
  read(request: { id: string; bytes: number }): Promise<unknown> {
    this.reads.push(request);
    return (
      this.readReply ?? Promise.resolve(this.chunks.shift() ?? chunk('', true))
    );
  }
  cancel(request: { id: string }): Promise<void> {
    this.cancelled.push(request.id);
    return this.cancelReply ?? Promise.resolve();
  }
}
