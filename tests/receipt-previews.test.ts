import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConversationPreviewLoader } from '../src/client/conversation-preview/index.ts';
import { ReceiptPreviews } from '../src/client/messages/receipt-previews.ts';
import type {
  MessageView,
  ReceiptCommit,
} from '../src/client/messages/controller.ts';
import type { MessageItem } from '../src/client/messages/history.ts';
import { messageStates } from '../src/client/message-state/index.ts';

const account = crypto.randomUUID(),
  peer = crypto.randomUUID();
function packet(sequence: number, change: Partial<MessageItem> = {}) {
  const item: MessageItem = {
    id: crypto.randomUUID(),
    kind: 'text',
    sender: peer,
    recipient: account,
    sequence,
    hash: 'b'.repeat(64),
    deleted: false,
    deletion: null,
    queue_active: false,
    status: 'received',
    sender_revision: 1,
    recipient_revision: 1,
    ...change,
  };
  const view: MessageView = {
    id: item.id,
    peer,
    kind: 'text',
    own: false,
    text: `Message ${sequence}`,
    hash: item.hash,
    state: messageStates.received,
    sequence,
    ...(item.relation ? { relation: item.relation } : {}),
  };
  return { item, view };
}
function fixture() {
  let lookups = 0,
    allowed = true;
  const previews = new ConversationPreviewLoader({
    load: () => Promise.reject(new Error('No list read belongs to this path')),
    changed: () => {},
  });
  const receipts = new ReceiptPreviews({
    previews,
    excluded: () => [],
    online: () => true,
    lookupAllowed: () => allowed,
    lookup: () => {
      lookups++;
    },
  });
  const commit = (
    rows: { item: MessageItem; view?: MessageView }[],
    change: Partial<ReceiptCommit> = {},
  ) => {
    receipts.commit({
      account,
      journal: true,
      items: rows.map((row) => row.item),
      views: rows.flatMap((row) => (row.view ? [row.view] : [])),
      covered: new Set(),
      ...change,
    });
    receipts.settle();
  };
  return {
    previews,
    commit,
    shown: () => previews.values.get(peer),
    lookups: () => lookups,
    allow: (value: boolean) => {
      allowed = value;
    },
    settle: () => receipts.settle(),
  };
}

await test('a live journal page publishes its new message as the preview without a list read', () => {
  const f = fixture();
  const first = packet(1);
  f.commit([first]);
  assert.equal(f.shown()?.id, first.item.id);
  const second = packet(2);
  f.commit([second]);
  assert.equal(f.shown()?.text, 'Message 2');
  assert.equal(f.lookups(), 0);
});

await test('removing or editing the shown preview, recovery rows and non-journal cuts use one deferred list read', () => {
  const cases: {
    name: string;
    page: (shown: ReturnType<typeof packet>) => {
      rows: { item: MessageItem; view?: MessageView }[];
      change?: Partial<ReceiptCommit>;
    };
  }[] = [
    {
      name: 'removed preview',
      page: (shown) => ({ rows: [{ item: { ...shown.item, deleted: true } }] }),
    },
    {
      name: 'edited preview',
      page: (shown) => {
        const edit = packet(5, {
          relation: {
            id: shown.item.id,
            hash: shown.item.hash,
            author: peer,
            type: 'edit',
          },
        });
        return { rows: [edit] };
      },
    },
    {
      name: 'recovery row',
      page: () => ({ rows: [{ item: packet(6).item, view: packet(3).view }] }),
    },
    {
      name: 'tail cut',
      page: () => ({ rows: [packet(7)], change: { journal: false } }),
    },
  ];
  for (const { name, page } of cases) {
    const f = fixture();
    const shown = packet(4);
    f.commit([shown]);
    f.allow(false);
    const { rows, change } = page(shown);
    f.commit(rows, change);
    assert.equal(
      f.lookups(),
      0,
      `${name}: waits while list reads are deferred`,
    );
    f.allow(true);
    f.settle();
    f.settle();
    assert.equal(f.lookups(), 1, `${name}: one list read`);
  }
});

await test('older edits and removals, reactions and windows that publish themselves need no list read', () => {
  const f = fixture();
  const older = packet(1),
    shown = packet(2);
  f.commit([older, shown]);
  const reaction = packet(3, {
    relation: {
      id: shown.item.id,
      hash: shown.item.hash,
      author: peer,
      type: 'reaction',
    },
  });
  const edit = packet(4, {
    relation: {
      id: older.item.id,
      hash: older.item.hash,
      author: peer,
      type: 'edit',
    },
  });
  f.commit([reaction, edit, { item: { ...older.item, deleted: true } }]);
  assert.equal(f.shown()?.id, shown.item.id);
  f.commit([packet(5)], { covered: new Set([peer]) });
  assert.equal(
    f.shown()?.id,
    shown.item.id,
    'a covered window owns its preview',
  );
  assert.equal(f.lookups(), 0);
});
