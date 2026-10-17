import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay, setImmediate } from 'node:timers/promises';
import {
  createPinnedVolume,
  createRuntimeContentCapacity,
} from '../src/server/storage-capacity/index.ts';
import type { VolumeFilesystem } from '../src/server/storage-capacity/index.ts';

function volumeFixture() {
  const path = resolve('/synthetic-storage-bind'),
    state = {
      device: 2n,
      parent: 1n,
      canonical: path,
      directory: true,
      blocks: 100n,
      free: 60n,
      available: 50n,
      blockSize: 4096n,
    };
  let read: (() => Promise<void>) | undefined;
  const filesystem: VolumeFilesystem = {
    realpath: () => Promise.resolve(state.canonical),
    directory: (p) =>
      Promise.resolve({
        device: p === dirname(path) ? state.parent : state.device,
        directory: state.directory,
      }),
    space: async () => {
      await read?.();
      return {
        blockSize: state.blockSize,
        totalBlocks: state.blocks,
        freeBlocks: state.free,
        availableBlocks: state.available,
      };
    },
  };
  return {
    path,
    state,
    filesystem,
    waitForSpace(work: () => Promise<void>) {
      read = work;
    },
  };
}
await test('volume sampling uses fresh unprivileged availability and rejects device/path substitutions', async () => {
  const f = volumeFixture(),
    reader = await createPinnedVolume({
      directory: f.path,
      filesystem: f.filesystem,
    });
  assert.equal(await reader.read(), 50n * 4096n);
  f.state.available = 30n;
  assert.equal(await reader.read(), 30n * 4096n);
  f.state.device = 3n;
  await assert.rejects(reader.read(), /changed/u);
  f.state.device = 2n;
  f.state.canonical = '/another-volume';
  await assert.rejects(reader.read(), /unavailable/u);
});
await test('an ordinary directory, symbolic path or invalid filesystem measurement fails closed', async () => {
  const f = volumeFixture();
  f.state.parent = 2n;
  await assert.rejects(
    createPinnedVolume({ directory: f.path, filesystem: f.filesystem }),
    /mount required/u,
  );
  f.state.parent = 1n;
  f.state.directory = false;
  await assert.rejects(
    createPinnedVolume({ directory: f.path, filesystem: f.filesystem }),
    /unavailable/u,
  );
  f.state.directory = true;
  f.state.available = 61n;
  await assert.rejects(
    createPinnedVolume({ directory: f.path, filesystem: f.filesystem }),
    /space unavailable/u,
  );
  await assert.rejects(
    createPinnedVolume({ directory: tmpdir() }),
    /mount required|path unavailable/u,
  );
});
await test('a device change during sampling is detected after the filesystem query', async () => {
  const f = volumeFixture(),
    reader = await createPinnedVolume({
      directory: f.path,
      filesystem: f.filesystem,
    });
  f.waitForSpace(() => {
    f.state.device = 4n;
    return Promise.resolve();
  });
  await assert.rejects(reader.read(), /changed/u);
});
await test('timed-out filesystem work retains its owner and prevents an unbounded pending read queue', async () => {
  const f = volumeFixture(),
    reader = await createPinnedVolume({
      directory: f.path,
      filesystem: f.filesystem,
    });
  let release: (() => void) | undefined;
  f.waitForSpace(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const first = assert.rejects(reader.read(), /timed out/u);
  await setImmediate();
  await assert.rejects(reader.read(), /still pending/u);
  await delay(1100);
  await first;
  await assert.rejects(reader.read(), /still pending/u);
  release?.();
  await setImmediate();
  f.waitForSpace(async () => {});
  assert.equal(await reader.read(), 50n * 4096n);
});
await test('local fixtures keep explicit fixed budgets without filesystem fallback', async () => {
  assert.equal(
    await createRuntimeContentCapacity({ mode: 'fixed', bytes: 900000000 }),
    900000000,
  );
});
