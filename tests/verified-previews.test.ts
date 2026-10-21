import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  publishVerifiedConversationPreview,
  publishVerifiedPreviewReceipts,
} from '../src/client/messages/verified-previews.ts';
import { ConversationPreviewLoader } from '../src/client/conversation-preview/index.ts';
import type { MessageView } from '../src/client/messages/controller.ts';
import { messageStates } from '../src/client/message-state/index.ts';
import { encodeDailyText } from '../src/shared/daily/index.ts';

const message = (): MessageView => ({
  id: crypto.randomUUID(),
  peer: 'peer',
  kind: 'text',
  own: true,
  text: 'Verified latest message',
  hash: 'a'.repeat(64),
  state: messageStates.received,
  author: 'self',
  sequence: 2,
});
function fixture() {
  const previews = new ConversationPreviewLoader({
    load: () => Promise.reject(new Error('No IO belongs to this path')),
    changed: () => {},
  });
  return {
    previews,
    online: true,
    localOnly: false,
    projection: { peer: 'peer', latest: true },
  };
}
await test('older pages, offline and local archives cannot replace the online contact preview', () => {
  const f = fixture(),
    row = message();
  publishVerifiedConversationPreview({ ...f, rows: [row] });
  const original = f.previews.values.get('peer');
  const changed = { ...row, text: 'Unrelated older or offline content' };
  for (const state of [
    { projection: { peer: 'peer', latest: false } },
    { online: false },
    { localOnly: true },
  ]) {
    publishVerifiedConversationPreview({ ...f, ...state, rows: [changed] });
    assert.equal(f.previews.values.get('peer'), original);
  }
  publishVerifiedConversationPreview({ ...f, rows: null });
  assert.equal(
    f.previews.values.get('peer'),
    original,
    'Navigation hiding history retains the preview',
  );
});
await test('verified edits update the original latest message while preserving its existing read receipt', () => {
  const f = fixture(),
    row = message();
  publishVerifiedConversationPreview({ ...f, rows: [row] });
  f.previews.values.get('peer')!.read = true;
  const edit: MessageView = {
    ...row,
    id: crypto.randomUUID(),
    sequence: 3,
    relation: { id: row.id, hash: row.hash, author: row.author!, type: 'edit' },
    text: encodeDailyText({
      text: 'Verified edited text',
      reply: null,
      forwarded: false,
    }),
  };
  publishVerifiedConversationPreview({ ...f, rows: [edit, row] });
  assert.equal(f.previews.values.get('peer')?.id, row.id);
  assert.equal(f.previews.values.get('peer')?.text, 'Verified edited text');
  assert.equal(f.previews.values.get('peer')?.read, true);
});
await test('a verified empty window and the removal gate clear only the affected contact preview', () => {
  const f = fixture(),
    row = message();
  publishVerifiedConversationPreview({ ...f, rows: [row] });
  publishVerifiedConversationPreview({
    ...f,
    projection: { peer: 'other', latest: true },
    rows: [{ ...row, peer: 'other' }],
  });
  publishVerifiedConversationPreview({ ...f, rows: [] });
  assert.equal(f.previews.values.has('peer'), false);
  assert.equal(f.previews.values.has('other'), true);
  publishVerifiedConversationPreview({ ...f, rows: [row] });
  publishVerifiedConversationPreview({ ...f, rows: null, update: 'pending' });
  assert.equal(f.previews.values.has('peer'), false);
  assert.equal(f.previews.values.has('other'), true);
});
await test('selected receipts update the exact latest outgoing preview without rereading any message', () => {
  const f = fixture(),
    row = message();
  publishVerifiedConversationPreview({ ...f, rows: [row] });
  publishVerifiedPreviewReceipts({
    peer: 'peer',
    outgoing: [row.id],
    read: new Set([row.id]),
    previews: f.previews,
  });
  assert.equal(f.previews.values.get('peer')?.read, true);
  publishVerifiedPreviewReceipts({
    peer: 'peer',
    outgoing: ['older'],
    read: new Set(),
    previews: f.previews,
  });
  assert.equal(f.previews.values.get('peer')?.read, true);
  publishVerifiedPreviewReceipts({
    peer: 'peer',
    outgoing: [row.id],
    read: new Set(),
    previews: f.previews,
  });
  assert.equal(f.previews.values.get('peer')?.read, false);
});
