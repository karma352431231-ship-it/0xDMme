import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { test } from 'node:test';
import type { AccountSession } from '../src/shared/account/index.ts';
import { AccountError } from '../src/shared/account/index.ts';
import { DatabaseChanges } from '../src/server/database/index.ts';
import { MessageLive } from '../src/server/message-live/index.ts';
import { RankingLive } from '../src/server/community-ranking/index.ts';
import { reserveOperationMemory } from '../src/server/memory-admission/index.ts';
import { deferred } from './fixtures/deferred.ts';

const available = 1_048_576;
class LiveResponse extends EventEmitter {
  headersSent = false;
  writableLength = 0;
  destroyed = false;
  frames: string[] = [];
  setHeader(): this {
    return this;
  }
  writeHead(): this {
    this.headersSent = true;
    return this;
  }
  write(frame: string): boolean {
    this.frames.push(frame);
    return true;
  }
  // Socket close can arrive later than end/destroy; ownership cannot depend on it.
  end(): this {
    return this;
  }
  destroy(): this {
    this.destroyed = true;
    return this;
  }
  get response(): ServerResponse {
    return this as unknown as ServerResponse;
  }
}
function session(): AccountSession {
  return {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    address: '0x' + '1'.repeat(40),
    ecosystem: 'evm',
    name: 'Synthetic',
    profileRevision: 0,
    deviceState: 'pending',
    historyAuthorized: false,
  };
}
function source(kind: 'private' | 'public') {
  if (kind === 'public') {
    const live = new RankingLive({ subscribe: () => () => {} });
    return {
      open: (response: ServerResponse) => live.open(response),
      close: () => live.close(),
    };
  }
  const live = new MessageLive(new DatabaseChanges());
  return {
    open: (response: ServerResponse) =>
      live.open({
        session: session(),
        response,
        validate: () => Promise.resolve(true),
      }),
    close: () => live.close(),
  };
}
function assertReleased(): void {
  const release = reserveOperationMemory(available);
  assert.ok(release, 'Every owned reservation must be released');
  release();
}
for (const kind of ['private', 'public'] as const) {
  await test(`${kind} live streams reject shared memory pressure before headers and recover after close`, (t) => {
    t.mock.method(process, 'availableMemory', () => available);
    const live = source(kind);
    t.after(() => live.close());
    const held = reserveOperationMemory(available);
    assert.ok(held);
    const rejected = new LiveResponse();
    try {
      assert.throws(
        () => live.open(rejected.response),
        (error: unknown) =>
          error instanceof AccountError &&
          error.status === 503 &&
          error.message === 'Live update unavailable.',
      );
      assert.equal(rejected.headersSent, false);
      assert.deepEqual(rejected.frames, []);
    } finally {
      held();
    }
    const active = new LiveResponse();
    live.open(active.response);
    assert.equal(active.headersSent, true);
    assert.equal(reserveOperationMemory(available), null);
    active.emit('close');
    active.emit('error', new Error('Synthetic late socket error'));
    assertReleased();
  });
}

for (const kind of ['private', 'public'] as const) {
  for (const exit of [
    'error',
    'backpressure',
    'write failure',
    'header failure',
    'expiry',
    'shutdown',
  ] as const) {
    await test(`${kind} live stream releases headroom on ${exit} without waiting for socket close`, (t) => {
      t.mock.method(process, 'availableMemory', () => available);
      t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
      const live = source(kind);
      t.after(() => live.close());
      const target = new LiveResponse();
      if (exit === 'backpressure') target.write = () => false;
      if (exit === 'write failure')
        target.write = () => {
          throw new Error('Synthetic write failure');
        };
      if (exit === 'header failure')
        target.setHeader = () => {
          throw new Error('Synthetic header failure');
        };
      if (exit === 'header failure')
        assert.throws(() => live.open(target.response));
      else live.open(target.response);
      if (exit === 'error')
        target.emit('error', new Error('Synthetic socket error'));
      if (exit === 'expiry') t.mock.timers.tick(300000);
      if (exit === 'shutdown') live.close();
      assertReleased();
      target.emit('close');
      assertReleased();
    });
  }
}
await test('closed private streams retain validation headroom until the actual query settles', async (t) => {
  t.mock.method(process, 'availableMemory', () => available);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const changes = new DatabaseChanges();
  const live = new MessageLive(changes);
  t.after(() => live.close());
  const pending = deferred<boolean>();
  const target = new LiveResponse();
  const account = session();
  live.open({
    session: account,
    response: target.response,
    validate: () => pending.promise,
  });
  changes.committed([account.accountId]);
  t.mock.timers.tick(100);
  await new Promise<void>((resolve) => setImmediate(resolve));
  target.emit('close');
  t.mock.timers.tick(5000);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(reserveOperationMemory(available), null);
  pending.resolve(true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assertReleased();
  assert.deepEqual(target.frames, ['event: ready\ndata: {}\n\n']);
});
await test('synchronous private validation failure closes the stream and releases headroom', async (t) => {
  t.mock.method(process, 'availableMemory', () => available);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const changes = new DatabaseChanges();
  const live = new MessageLive(changes);
  t.after(() => live.close());
  const target = new LiveResponse();
  const account = session();
  live.open({
    session: account,
    response: target.response,
    validate: () => {
      throw new Error('Synthetic validation failure');
    },
  });
  changes.committed([account.accountId]);
  t.mock.timers.tick(100);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(target.frames.includes('event: invalidated\ndata: {}\n\n'));
  assertReleased();
});
