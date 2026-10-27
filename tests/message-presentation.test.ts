import {
  refreshDmChecks,
  clearDmChecks,
} from '../src/client/communities/dm-checks.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  messagePresentation,
  optionalSentAt,
} from '../src/shared/message-presentation/index.ts';
import {
  messageTime,
  messageReactions,
} from '../src/client/message-presentation/index.ts';
import {
  backupRecord,
  serializeRecord,
  deserializeRecord,
} from '../src/client/backup-records/index.ts';
import { projectDmMessages } from '../src/client/social-dm/presentation.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
import { encodeDailyText } from '../src/shared/daily/index.ts';
await test('optional authenticated clock accepts legacy absence, rejects malformed metadata, and survives encrypted-record serialization', () => {
  assert.deepEqual(messagePresentation(undefined), {});
  assert.deepEqual(messagePresentation({ version: 1, sentAt: 1760000000000 }), {
    sentAt: 1760000000000,
  });
  for (const value of [-1, 0, NaN, Infinity, 1.2, '123'])
    assert.throws(() => optionalSentAt(value));
  assert.throws(() => messagePresentation({ version: 2, sentAt: 123 }));
  const record = backupRecord({
    type: 'message',
    id: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    peer: crypto.randomUUID(),
    own: true,
    kind: 'text',
    text: 'synthetic',
    sentAt: 1760000000000,
  });
  assert.deepEqual(deserializeRecord(serializeRecord(record)), record);
  const legacy = { ...record };
  Reflect.deleteProperty(legacy, 'sentAt');
  assert.deepEqual(backupRecord(legacy), legacy);
});
await test('public reaction actions fold into their original bubble without exposing action text or replacing its time', () => {
  const root = {
    type: 'dm-message' as const,
    id: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    self: crypto.randomUUID(),
    peer: { id: crypto.randomUUID(), handle: 'peer', avatar: null },
    sequence: 1,
    own: false,
    kind: 'text' as const,
    media: null,
    text: 'Original',
    sentAt: 1760000000000,
  };
  const reaction = {
    ...root,
    id: crypto.randomUUID(),
    hash: 'b'.repeat(64),
    own: true,
    sequence: 2,
    text: encodeDailyText({ text: '😂', reply: null, forwarded: false }),
    relation: {
      id: root.id,
      hash: root.hash,
      author: root.peer.id,
      type: 'reaction' as const,
    },
    sentAt: 1760000002000,
  };
  const result = projectDmMessages([root], [reaction], (id) => id === root.id);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.localOnly, true);
  assert.equal(result[0]?.displayText, 'Original');
  assert.equal(result[0]?.sentAt, root.sentAt);
  assert.equal(result[0]?.ownReaction, '😂');
  const edit = {
    ...reaction,
    id: crypto.randomUUID(),
    own: false,
    text: encodeDailyText({
      text: 'Edited public text',
      reply: null,
      forwarded: false,
    }),
    relation: { ...reaction.relation, type: 'edit' as const },
  };
  assert.deepEqual(backupRecord(edit), edit);
  const edited = projectDmMessages([root], [reaction, edit])[0];
  assert.equal(edited?.localOnly, undefined);
  assert.equal(edited?.displayText, 'Edited public text');
  assert.equal(edited?.edited, true);
  assert.equal(edited?.sentAt, root.sentAt);
  assert.deepEqual(edited?.reactions, ['😂']);
  assert.throws(() => backupRecord({ ...edit, own: true }), /author/u);
  assert.throws(() =>
    projectDmMessages(
      [root],
      [
        {
          ...reaction,
          relation: { ...reaction.relation, hash: 'c'.repeat(64) },
        },
      ],
    ),
  );
});
await test('reaction chip removes only the current user’s emoji, and a legacy message has no fabricated clock', async (t) => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (tag: string) => new ChatNode(tag),
      createElementNS: (_ns: string, tag: string) => new ChatNode(tag),
    },
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'document'));
  assert.equal(messageTime(undefined), null);
  assert.equal(
    messageTime(1760000000000)?.getAttribute('datetime'),
    '2025-10-09T08:53:20.000Z',
  );
  let removed = 0;
  const host = messageReactions({
    reactions: ['😂', '😂', '👍'],
    ownReaction: '😂',
    remove: () => {
      removed++;
      return Promise.resolve();
    },
    action: (label, work) => {
      const button = new ChatNode('button');
      button.textContent = label;
      button.addEventListener('click', () => {
        void work();
      });
      return button as unknown as HTMLButtonElement;
    },
  });
  const chips = (host as unknown as ChatNode).children;
  assert.equal(chips.length, 2);
  assert.equal(chips[0]?.getAttribute('aria-pressed'), 'true');
  assert.equal(chips[1]?.disabled, true);
  chips[1]?.click();
  assert.equal(removed, 0);
  chips[0]?.click();
  await Promise.resolve();
  assert.equal(removed, 1);
});

await test('public reaction reads deduplicate within a view and a stale view sends no further receipts', async (t) => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { visibilityState: 'visible' },
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'document'));
  const history = new ChatNode('div') as unknown as HTMLElement,
    batches: string[][] = [];
  const controller = {
    messageStates: (input: { read: string[] }) => {
      if (input.read.length) batches.push(input.read);
      return Promise.resolve([]);
    },
  };
  let usable = true;
  const input = {
    history,
    controller,
    peer: 'peer',
    items: [],
    reactionReads: Array.from({ length: 20 }, () => crypto.randomUUID()),
    usable: () => usable,
  };
  await refreshDmChecks(input);
  await refreshDmChecks(input);
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [16, 4],
  );
  clearDmChecks(history);
  usable = false;
  await refreshDmChecks(input);
  assert.equal(batches.length, 2);
});
