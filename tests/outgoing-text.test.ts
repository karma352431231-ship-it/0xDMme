import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OutgoingTexts } from '../src/client/messages/outgoing-text.ts';
import { deferred } from './fixtures/deferred.ts';
import type { TextDraft } from '../src/client/text-send/index.ts';

await test('restored own texts keep their durable FIFO order rather than random ID order', () => {
  const outgoing = new OutgoingTexts();
  outgoing.restore([
    {
      id: 'a',
      peer: 'peer',
      text: 'Second',
      createdAt: 1000,
      order: 'outbox-order:0000000000000002:a',
    },
    {
      id: 'z',
      peer: 'peer',
      text: 'First',
      createdAt: 1000,
      order: 'outbox-order:0000000000000001:z',
    },
  ]);
  assert.deepEqual(
    outgoing.forPeer('peer').map((draft) => draft.text),
    ['First', 'Second'],
  );
});

await test('own outgoing content is bounded, survives empty verified pages and clears on session replacement', () => {
  const outgoing = new OutgoingTexts();
  outgoing.restore(
    Array.from({ length: 80 }, (_, n) => ({
      id: String(n),
      peer: 'peer',
      text: 'Synthetic',
    })),
  );
  assert.equal(outgoing.forPeer('peer').length, 64);
  const visible = outgoing.forPeer('peer').map((draft) => draft.id);
  outgoing.restore([{ id: '0', peer: 'peer', text: 'An older durable draft' }]);
  assert.deepEqual(
    outgoing.forPeer('peer').map((draft) => draft.id),
    visible,
    'Repeated pending projections must not rotate old drafts back into the display window.',
  );
  outgoing.observed([]);
  assert.equal(outgoing.forPeer('peer').length, 64);
  outgoing.restore([
    { id: 'oversized', peer: 'peer', text: 'a'.repeat(131073) },
  ]);
  assert.equal(outgoing.has('oversized'), false);
  outgoing.reset();
  assert.equal(outgoing.has('0'), false);
  assert.deepEqual(outgoing.forPeer('peer'), []);
});

await test('repeated pending projections share one authorized restore', async () => {
  const outgoing = new OutgoingTexts(),
    held = deferred<TextDraft[]>();
  let reads = 0;
  const input = {
    peer: 'peer',
    pending: [{ id: 'draft', peer: 'peer', text: true }],
    verified: [],
    current: () => true,
    read: () => {
      reads++;
      return held.promise;
    },
  };
  const first = outgoing.restorePending(input),
    second = outgoing.restorePending(input);
  held.resolve([{ id: 'draft', peer: 'peer', text: 'Old session' }]);
  await Promise.all([first, second]);
  assert.equal(reads, 1);
});

await test('a restore completed after invalidation cannot repopulate a replaced session', async () => {
  const outgoing = new OutgoingTexts(),
    held = deferred<TextDraft[]>();
  let current = true;
  const restoring = outgoing.restorePending({
    peer: 'peer',
    pending: [{ id: 'old', peer: 'peer', text: true }],
    verified: [],
    current: () => current,
    read: () => held.promise,
  });
  current = false;
  outgoing.reset();
  held.resolve([{ id: 'old', peer: 'peer', text: 'Old plaintext' }]);
  assert.equal(await restoring, false);
  assert.deepEqual(outgoing.forPeer('peer'), []);
});
