import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DmOutgoingMedia } from '../src/client/communities/dm-outgoing-media.ts';
import type { AcceptedDmMedia } from '../src/client/social-dm/index.ts';
import type { AttachmentSelection } from '../src/client/attachments/index.ts';
function message(): AcceptedDmMedia {
  return {
    id: crypto.randomUUID(),
    peer: 'peer',
    media: 'photo',
    content: {
      version: 1,
      name: 'synthetic.png',
      type: 'image/png',
      caption: 'Caption',
      image: true,
      file: {
        encryption: '{}',
        ref: {
          id: crypto.randomUUID(),
          hash: 'a'.repeat(64),
          bytes: 3,
          parts: [],
        },
      },
      thumbnail: null,
    },
  };
}
await test('accepted media owns a preview after upload input disposal and transfers it only to matching verified content', () => {
  let changed = 0;
  const owner = new DmOutgoingMedia(() => {
    changed++;
  });
  const selected: AttachmentSelection = {
    name: 'synthetic.png',
    type: 'image/png',
    image: true,
    bytes: new Uint8Array([1, 2, 3]),
    thumbnail: null,
  };
  const accepted = message();
  owner.acceptance(selected)(accepted);
  selected.bytes.fill(0);
  assert.equal(changed, 1);
  assert.equal(owner.rows('peer', new Set()).length, 1);
  assert.equal(owner.rows('other-peer', new Set()).length, 0);
  assert.equal(
    owner.rows('peer', new Set([accepted.id])).length,
    0,
    'stable ID reconciliation never draws two rows',
  );
  assert.equal(owner.take(accepted.id, false, 'wrong-hash'), null);
  assert.deepEqual(
    owner.take(accepted.id, false, accepted.content.file.ref.hash),
    new Uint8Array([1, 2, 3]),
  );
  assert.equal(owner.rows('peer', new Set()).length, 0);
});
await test('logout discards accepted previews and a late acknowledgement cannot enter the next session', () => {
  const owner = new DmOutgoingMedia(() => {}),
    accepted = message();
  const late = owner.acceptance(null);
  owner.acceptance(null)(accepted);
  owner.reset();
  late(message());
  assert.equal(owner.rows('peer', new Set()).length, 0);
});
