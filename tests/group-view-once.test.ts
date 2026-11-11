import { encodeGroupText } from '../src/shared/group-messages/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupParticipant } from './fixtures/group-participant.ts';
import { createRecoveryKey } from '../src/client/message-recovery/index.ts';
import { prepareGroupViewOnce } from '../src/client/group-view-once/index.ts';
import { decryptViewOnce } from '../src/client/view-once/index.ts';
import { decodeDailyText, encodeDailyText } from '../src/shared/daily/index.ts';
import { projectGroupMessages } from '../src/client/groups/message-projection.ts';
import type { GroupView } from '../src/client/groups/reader.ts';
import { groupMessageView } from '../src/client/groups/message-content.ts';
import { GroupCache, groupCacheScope } from '../src/client/groups/cache.ts';
import { localGet } from '../src/client/message-storage/index.ts';
import { recordDatabase } from './fixtures/record-database.ts';

await test('a group payload shares ciphertext while binding independently wrapped recipient keys to its signed placeholder', async () => {
  const sender = await groupParticipant(),
    one = await groupParticipant(),
    two = await groupParticipant();
  const recipients = await Promise.all([
    createRecoveryKey(one.authority),
    createRecoveryKey(two.authority),
  ]);
  const group = {
      groupId: crypto.randomUUID(),
      epoch: 1,
      head: 'a'.repeat(64),
    },
    id = crypto.randomUUID(),
    content = { text: 'Synthetic group secret 🔐' };
  const prepared = await prepareGroupViewOnce({
    id,
    group,
    sender: sender.accountId,
    recipients,
    content,
  });
  const metadata = decodeDailyText(prepared.text).viewOnce!;
  assert.ok(metadata);
  assert.equal(prepared.text.includes('secret'), false);
  assert.equal(JSON.stringify(prepared.manifest).includes('ciphertext'), false);
  const {
    recipients: audience,
    epoch,
    head,
    media,
    ...identity
  } = prepared.manifest;
  assert.equal(audience.length, 2);
  assert.equal(epoch, 1);
  assert.equal(head, group.head);
  assert.equal(media, false);
  for (const [index, recipient] of [one, two].entries()) {
    const input = {
      authority: recipient.authority,
      recovery: recipients[index]!,
      id,
      scope: 'group' as const,
      group: group.groupId,
      peer: sender.accountId,
      metadata,
      response: {
        header: { ...identity, key: prepared.keys[index]! },
        manifest: prepared.manifest,
        bytes: prepared.bytes,
      },
    };
    assert.deepEqual(await decryptViewOnce(input), content);
    await assert.rejects(
      decryptViewOnce({ ...input, group: crypto.randomUUID() }),
    );
    await assert.rejects(
      decryptViewOnce({
        ...input,
        response: {
          ...input.response,
          header: { ...identity, key: prepared.keys[1 - index]! },
        },
      }),
    );
    await assert.rejects(
      decryptViewOnce({
        ...input,
        metadata: { ...metadata, hash: 'f'.repeat(64) },
      }),
    );
    await assert.rejects(
      decryptViewOnce({
        ...input,
        response: {
          ...input.response,
          manifest: { ...prepared.manifest, epoch: 2 },
        },
      }),
    );
  }
});

await test('group reactions retain the latest action per author without changing the original window or dropping edits and quotes', () => {
  const root: GroupView = {
    id: crypto.randomUUID(),
    groupId: crypto.randomUUID(),
    sequence: 1,
    epoch: 1,
    hash: 'a'.repeat(64),
    sender: crypto.randomUUID(),
    own: true,
    kind: 'text',
    contentFormat: 'daily',
    text: encodeDailyText({
      text: 'Original',
      reply: crypto.randomUUID(),
      forwarded: true,
    }),
    unavailableMedia: [],
  };
  const reaction = (
    sender: string,
    emoji: string,
    sequence: number,
  ): GroupView => ({
    ...root,
    id: crypto.randomUUID(),
    sequence,
    sender,
    own: sender === root.sender,
    text: encodeDailyText({ text: emoji, reply: null, forwarded: false }),
    relation: {
      id: root.id,
      hash: root.hash,
      author: root.sender,
      type: 'reaction',
    },
  });
  const other = crypto.randomUUID(),
    first = projectGroupMessages(
      [root],
      [reaction(other, '👍', 2), reaction(root.sender, '❤️', 3)],
    );
  assert.equal(root.reactionStates, undefined);
  assert.deepEqual(groupMessageView(first[0]!).reactions, ['👍', '❤️']);
  const second = projectGroupMessages(first, [
    reaction(other, '😂', 4),
    reaction(root.sender, '', 5),
    reaction(other, '👍', 2),
  ]);
  assert.deepEqual(groupMessageView(second[0]!).reactions, ['😂']);
  assert.deepEqual(groupMessageView(first[0]!).reactions, ['👍', '❤️']);
  assert.equal(
    groupMessageView(second[0]!).content.reply,
    decodeDailyText(root.text).reply,
  );
  assert.equal(groupMessageView(second[0]!).content.forwarded, true);
  assert.throws(() =>
    projectGroupMessages(first, [
      {
        ...reaction(other, '👍', 6),
        relation: {
          id: root.id,
          hash: 'b'.repeat(64),
          author: root.sender,
          type: 'reaction',
        },
      },
    ]),
  );
});

await test('structured group text preserves the prior size budget and legacy protocol-looking text remains literal', () => {
  const value = 'x'.repeat(32000);
  const encoded = encodeGroupText({
    text: value,
    reply: null,
    forwarded: false,
  });
  const base: GroupView = {
    id: crypto.randomUUID(),
    groupId: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    sequence: 1,
    epoch: 1,
    sender: crypto.randomUUID(),
    own: true,
    kind: 'text',
    text: encoded,
    unavailableMedia: [],
  };
  assert.equal(groupMessageView(base).content.text, encoded);
  assert.equal(
    groupMessageView({ ...base, contentFormat: 'daily' }).content.text,
    value,
  );
  const legacy = '\u001e0xdmme:1:{invalid historical text';
  assert.equal(
    groupMessageView({ ...base, text: legacy }).content.text,
    legacy,
  );
});

await test('editing legacy group text adopts its authenticated structured format and retains it when the original is read again', () => {
  const root: GroupView = {
    id: crypto.randomUUID(),
    groupId: crypto.randomUUID(),
    sequence: 1,
    epoch: 1,
    hash: 'a'.repeat(64),
    sender: crypto.randomUUID(),
    own: true,
    kind: 'text',
    text: 'Legacy original',
    unavailableMedia: [],
  };
  const edit: GroupView = {
    ...root,
    id: crypto.randomUUID(),
    sequence: 2,
    contentFormat: 'daily',
    text: encodeGroupText({ text: 'Edited', reply: null, forwarded: false }),
    relation: {
      id: root.id,
      hash: root.hash,
      author: root.sender,
      type: 'edit',
    },
  };
  const changed = projectGroupMessages([root], [edit]);
  assert.equal(groupMessageView(changed[0]!).content.text, 'Edited');
  assert.equal(
    groupMessageView(projectGroupMessages(changed, [root])[0]!).content.text,
    'Edited',
  );
});

await test('root reaction cleanup spans storage pages, preserves other messages and releases its exact budget idempotently', async (t) => {
  const database = recordDatabase();
  for (const [key, value] of Object.entries({
    indexedDB: database.factory,
    IDBKeyRange: database.range,
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  const user = await groupParticipant(),
    group = crypto.randomUUID(),
    root = crypto.randomUUID(),
    cache = new GroupCache(user.authority, group),
    scope = groupCacheScope(user.accountId, group),
    retained = `reaction:${crypto.randomUUID()}:${user.accountId}`;
  await cache.put(retained, { text: 'Retained' });
  const baseline = await localGet(scope, 'usage'),
    names = Array.from(
      { length: 20 },
      () => `reaction:${root}:${crypto.randomUUID()}`,
    );
  await cache.putMany(names.map((name) => ({ name, value: { text: '👍' } })));
  assert.ok(Number(await localGet(scope, 'usage')) > Number(baseline));
  await cache.removeReactions(root);
  for (const name of names) assert.equal(await cache.get(name), null);
  assert.deepEqual(await cache.get(retained), { text: 'Retained' });
  assert.equal(await localGet(scope, 'usage'), baseline);
  await cache.removeReactions(root);
  assert.equal(await localGet(scope, 'usage'), baseline);
});
