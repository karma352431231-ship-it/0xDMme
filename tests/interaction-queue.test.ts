import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InteractionQueue } from '../src/client/interaction-queue/index.ts';

await test('an image choice waits behind a background read without marking the screen busy', async () => {
  const changes: boolean[] = [];
  let release = () => {};
  const read = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new InteractionQueue({
    generation: () => 1,
    changed: (_busy, quiet) => changes.push(quiet),
    failed: (error) => {
      throw error;
    },
    settled: () => {},
  });
  const background = queue.run(() => read, { background: true });
  let selected = false;
  const choice = queue.run(
    () => {
      selected = true;
      return Promise.resolve();
    },
    { quiet: true },
  );
  assert.equal(selected, false);
  release();
  await Promise.all([background, choice]);
  assert.equal(selected, true);
  assert.equal(changes.every(Boolean), true);
});

await test('navigation discards an image choice waiting behind an old read', async () => {
  let generation = 1,
    selected = false,
    release = () => {};
  const read = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new InteractionQueue({
    generation: () => generation,
    changed: () => {},
    failed: (error) => {
      throw error;
    },
    settled: () => {},
  });
  const background = queue.run(() => read, { background: true });
  const choice = queue.run(
    () => {
      selected = true;
      return Promise.resolve();
    },
    { quiet: true },
  );
  generation++;
  release();
  await Promise.all([background, choice]);
  assert.equal(selected, false);
});
