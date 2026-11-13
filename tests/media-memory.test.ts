import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MediaMemory } from '../src/client/media-memory/index.ts';

const bytes = (size: number, fill = 7) =>
  new Uint8Array(new ArrayBuffer(size)).fill(fill);

await test('media opened once is served again without reading, as an independent copy', async () => {
  const memory = new MediaMemory();
  let reads = 0;
  const load = () => {
    reads++;
    return Promise.resolve(bytes(8));
  };
  const first = await memory.read('m1', 'original', load);
  first.fill(0); // callers wipe what they received
  assert.equal(memory.has('m1', 'original'), true);
  assert.equal(memory.has('m1', 'thumbnail'), false);
  const again = await memory.read('m1', 'original', load);
  assert.equal(reads, 1);
  assert.deepEqual([...again], [...bytes(8)]);
});

await test('deleting a message or losing access drops its media; a failed read keeps nothing', async () => {
  const memory = new MediaMemory();
  await memory.read('m1', 'original', () => Promise.resolve(bytes(4)));
  await memory.read('m1', 'thumbnail', () => Promise.resolve(bytes(2)));
  await memory.read('m2', 'original', () => Promise.resolve(bytes(4)));
  memory.forget('m1');
  assert.equal(memory.has('m1', 'original'), false);
  assert.equal(memory.has('m1', 'thumbnail'), false);
  assert.equal(memory.has('m2', 'original'), true);
  memory.clear();
  assert.equal(memory.has('m2', 'original'), false);
  await assert.rejects(
    memory.read('m3', 'original', () => Promise.reject(new Error('denied'))),
  );
  assert.equal(memory.has('m3', 'original'), false);
});

await test('the memory stays bounded and drops the least recently used first', async () => {
  const memory = new MediaMemory();
  // Larger than one entry may be: served, not kept.
  await memory.read('big', 'original', () =>
    Promise.resolve(bytes(25 * 1024 * 1024)),
  );
  assert.equal(memory.has('big', 'original'), false);
  for (let n = 0; n < 64; n++)
    await memory.read(`m${n}`, 'original', () => Promise.resolve(bytes(1)));
  // Using m0 again makes m1 the oldest.
  await memory.read('m0', 'original', () => Promise.reject(new Error('read')));
  await memory.read('m64', 'original', () => Promise.resolve(bytes(1)));
  assert.equal(memory.has('m0', 'original'), true);
  assert.equal(memory.has('m1', 'original'), false);
  assert.equal(memory.has('m64', 'original'), true);
});
