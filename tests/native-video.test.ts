import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NativeVideoPlayback } from '../src/client/native-video/index.ts';
import type { NativeVideoPort } from '../src/client/native-video/index.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';

function fixture() {
  const chunks: { offset: number; bytes: string }[] = [];
  let closed = 0,
    shown = 0;
  const port: NativeVideoPort = {
    begin: () => Promise.resolve(),
    append: (input) => {
      chunks.push(input);
      return Promise.resolve();
    },
    show: () => {
      shown++;
      return Promise.resolve();
    },
    status: () => Promise.resolve('closed'),
    close: () => {
      closed++;
      return Promise.resolve();
    },
    presented: () => Promise.resolve({ state: 'unavailable', elapsedMs: 0 }),
  };
  return {
    port,
    chunks,
    closed: () => closed,
    shown: () => shown,
    player: new NativeVideoPlayback(() => port),
  };
}
await test('private video transfers exact ordered bounded bytes, wipes them and remains replayable', async () => {
  const f = fixture();
  for (let run = 0; run < 2; run++) {
    const bytes = new Uint8Array(65539).fill(7);
    assert.equal(
      await f.player.play({ bytes, mime: 'video/mp4', current: () => true }),
      true,
    );
    assert.ok(bytes.every((v) => v === 0));
  }
  assert.deepEqual(
    f.chunks.map((c) => c.offset),
    [0, 65536, 0, 65536],
  );
  assert.equal(Buffer.from(f.chunks[0]!.bytes, 'base64').length, 65536);
  assert.equal(Buffer.from(f.chunks[1]!.bytes, 'base64').length, 3);
  assert.ok(Buffer.from(f.chunks[0]!.bytes, 'base64').every((v) => v === 7));
  assert.equal(f.closed(), 2);
  assert.equal(f.shown(), 2);
});
await test('an unavailable native port preserves the caller bytes for the existing web player', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const player = new NativeVideoPlayback(() => null);
  assert.equal(
    await player.play({ bytes, mime: 'video/mp4', current: () => true }),
    false,
  );
  assert.deepEqual([...bytes], [1, 2, 3]);
});
await test('partial transfer failure closes the native buffer and never shows an incomplete video', async () => {
  const f = fixture(),
    bytes = new Uint8Array(65539).fill(7);
  f.port.append = () =>
    Promise.reject(new Error('Append acknowledgement lost.'));
  await assert.rejects(
    f.player.play({ bytes, mime: 'video/mp4', current: () => true }),
    /Append acknowledgement lost/,
  );
  assert.ok(bytes.every((v) => v === 0));
  assert.equal(f.shown(), 0);
  assert.equal(f.closed(), 1);
});
await test('leaving a private history during transfer cancels presentation after draining its acknowledgement', async () => {
  const f = fixture(),
    entered = deferred<void>(),
    pending = deferred<void>();
  const bytes = new Uint8Array(65539).fill(7);
  f.port.append = () => {
    entered.resolve();
    return pending.promise;
  };
  const playing = f.player.play({
    bytes,
    mime: 'video/mp4',
    current: () => true,
  });
  await waitForBoundary(entered.promise);
  f.player.close();
  pending.resolve();
  assert.equal(await playing, true);
  assert.equal(f.shown(), 0);
  assert.equal(f.closed(), 1);
  assert.ok(bytes.every((v) => v === 0));
});
