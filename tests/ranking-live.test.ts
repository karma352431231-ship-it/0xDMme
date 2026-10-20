import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { createCommunityHandler } from '../src/server/communities/index.ts';
import { accountRankingLookup } from '../src/server/communities/account-ranking.ts';
import { RankingConnection } from '../src/client/communities/ranking-live-connection.ts';

class LiveResponse extends EventEmitter {
  headers = new Map<string, string>();
  frames: string[] = [];
  writableLength = 0;
  destroyed = false;
  ended = false;
  status = 0;
  setHeader(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }
  writeHead(status: number): this {
    this.status = status;
    return this;
  }
  write(frame: string): boolean {
    this.frames.push(frame);
    return true;
  }
  end(frame?: string): void {
    if (frame) this.frames.push(frame);
    this.ended = true;
    this.emit('close');
  }
  destroy(): void {
    this.destroyed = true;
    this.emit('close');
  }
  get response(): ServerResponse {
    return this as unknown as ServerResponse;
  }
}
const request = (method: string): IncomingMessage =>
  ({
    method,
    url: '/api/communities/ranking-events',
    socket: { remoteAddress: '127.0.0.1' },
  }) as IncomingMessage;
await test('public ranking events expose only committed-publication hints and release failed/closed streams', async (t) => {
  let notify = () => {};
  let released = false;
  const handler = createCommunityHandler({
    rankingSignals: {
      subscribe: (topic, listener) => {
        assert.equal(topic, 'ranking-published');
        notify = listener;
        return () => {
          released = true;
        };
      },
    },
    read: () => Promise.reject(new Error('Unexpected profile read')),
    list: () => Promise.resolve({ items: [], next: null }),
  });
  t.after(() => handler.close());
  const first = new LiveResponse();
  await handler.handle(request('GET'), first.response);
  assert.equal(first.status, 200);
  assert.equal(
    first.headers.get('Content-Type'),
    'text/event-stream; charset=utf-8',
  );
  assert.equal(first.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(first.frames, ['event: ready\ndata: {}\n\n']);
  notify();
  assert.equal(first.frames.at(-1), 'event: changed\ndata: {}\n\n');
  first.writableLength = 8193;
  notify();
  assert.equal(first.destroyed, true);
  const count = first.frames.length;
  notify();
  assert.equal(first.frames.length, count);
  const second = new LiveResponse();
  await handler.handle(request('GET'), second.response);
  handler.close();
  assert.equal(second.ended, true);
  assert.equal(released, true);
  const invalid = new LiveResponse();
  await handler.handle(request('POST'), invalid.response);
  assert.equal(invalid.status, 405);
});
await test('anonymous account discovery refuses Following and invalid or repeated filters', async () => {
  let reads = 0;
  const read = () => {
    reads++;
    return Promise.reject(new Error('Unexpected public read'));
  };
  for (const query of [
    'order=following',
    'order=other',
    'order=new&order=size',
    'actor=someone',
  ]) {
    await assert.rejects(
      accountRankingLookup(
        new URL('https://0xdmme.app/api/communities/accounts?' + query),
        read,
      ),
    );
  }
  assert.equal(reads, 0);
});
async function turn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
await test('the public ranking connection omits credentials, accepts bounded hints and aborts on close', async (t) => {
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  let changed = 0;
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', (_url: string, options: RequestInit) => {
    assert.equal(_url, '/api/communities/ranking-events');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    signal = options.signal as AbortSignal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        stream = controller;
        signal!.addEventListener(
          'abort',
          () => controller.error(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      },
    });
    return Promise.resolve(
      new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    );
  });
  const connection = new RankingConnection(() => {
    changed++;
  });
  t.after(() => connection.close());
  await turn();
  const encoder = new TextEncoder();
  stream!.enqueue(encoder.encode('event: ready\ndata: {}\n\n'));
  await turn();
  assert.equal(changed, 1);
  stream!.enqueue(encoder.encode(': heartbeat\n\n'));
  await turn();
  assert.equal(changed, 1);
  stream!.enqueue(encoder.encode('event: chang'));
  stream!.enqueue(encoder.encode('ed\ndata: {}\n\n'));
  await turn();
  assert.equal(changed, 2);
  connection.close();
  await turn();
  assert.equal(signal!.aborted, true);
});

await test('a lost ranking stream reconnects and reconciles without polling ranking data', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  let changed = 0;
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  t.mock.method(globalThis, 'fetch', (_url: string, options: RequestInit) => {
    attempts++;
    if (attempts === 1)
      return Promise.reject(new Error('Synthetic connection loss'));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        stream = controller;
        options.signal!.addEventListener(
          'abort',
          () => controller.error(new Error('Synthetic close')),
          { once: true },
        );
      },
    });
    return Promise.resolve(
      new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    );
  });
  const connection = new RankingConnection(() => {
    changed++;
  });
  t.after(() => connection.close());
  await turn();
  assert.equal(attempts, 1);
  t.mock.timers.tick(999);
  await turn();
  assert.equal(attempts, 1);
  t.mock.timers.tick(1);
  await turn();
  assert.equal(attempts, 2);
  stream!.enqueue(new TextEncoder().encode('event: ready\ndata: {}\n\n'));
  await turn();
  assert.equal(changed, 1);
  connection.close();
  await turn();
  t.mock.timers.tick(30000);
  await turn();
  assert.equal(attempts, 2);
});
