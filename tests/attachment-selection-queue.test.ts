import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AttachmentSelectionQueue,
  attachmentBatchLimit,
} from '../src/client/attachment-ui/selection-queue.ts';
import type { AttachmentSelection } from '../src/client/attachments/index.ts';

function file(name: string, size: number): AttachmentSelection {
  return {
    name,
    type: 'image/png',
    image: true,
    bytes: new Uint8Array(size).fill(7),
    thumbnail: null,
  };
}

await test('files chosen together share one byte limit and keep the order chosen', () => {
  const queue = new AttachmentSelectionQueue(10),
    first = file('a.png', 4),
    second = file('b.png', 5),
    third = file('c.png', 2);
  assert.equal(queue.admit(first), 'added');
  assert.equal(queue.admit(second), 'added');
  assert.equal(queue.fits(2), false);
  assert.equal(queue.admit(third), 'over-limit');
  assert.deepEqual([...third.bytes], [0, 0]);
  assert.deepEqual(
    queue.all.map((item) => item.name),
    ['a.png', 'b.png'],
  );
  assert.equal(queue.used, 9);
  queue.remove(first);
  assert.deepEqual([...first.bytes], [0, 0, 0, 0]);
  assert.equal(queue.first, second);
  assert.equal(queue.fits(5), true);
});

await test('at most the batch limit waits, and a voice note replaces every file', () => {
  const queue = new AttachmentSelectionQueue(1_000),
    files = Array.from({ length: attachmentBatchLimit }, (_, index) =>
      file(`${index}.png`, 1),
    );
  for (const item of files) assert.equal(queue.admit(item), 'added');
  const extra = file('extra.png', 1);
  assert.equal(queue.full, true);
  assert.equal(queue.admit(extra), 'full');
  assert.deepEqual([...extra.bytes], [0]);
  const voice = { ...file('voice.ogg', 3), image: false };
  queue.replace(voice);
  assert.deepEqual(queue.all, [voice]);
  assert.ok(files.every((item) => item.bytes[0] === 0));
  queue.clear();
  assert.equal(queue.first, null);
  assert.deepEqual([...voice.bytes], [0, 0, 0]);
});
