import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PublicMediaRetention } from '../src/client/public-media/retained.ts';

await test('public media evicts the least recently visited inactive file within the byte budget and never interrupts visible playback', () => {
  const memory = new PublicMediaRetention(),
    removed: number[] = [];
  const keep = (id: number, visible = false) =>
    memory.keep({
      bytes: 64 * 1024 * 1024,
      visible,
      dispose: () => {
        removed.push(id);
      },
    });
  const first = keep(1),
    second = keep(2),
    playing = keep(3, true);
  assert.deepEqual(removed, []);
  first.visibility(true);
  first.visibility(false);
  const fourth = keep(4);
  assert.deepEqual(removed, [2]);
  playing.visibility(false);
  assert.deepEqual(removed, [2, 1]);
  fourth.release();
  second.release();
  playing.release();
});

await test('tiny visited media respect the aggregate item budget and explicit cleanup removes its reservation', () => {
  const memory = new PublicMediaRetention(),
    removed: number[] = [];
  const keep = (id: number) =>
    memory.keep({
      bytes: 1,
      visible: false,
      dispose: () => {
        removed.push(id);
      },
    });
  const first = keep(0);
  for (let id = 1; id < 48; id++) keep(id);
  first.release();
  keep(48);
  assert.deepEqual(removed, []);
  keep(49);
  assert.deepEqual(removed, [1]);
});
