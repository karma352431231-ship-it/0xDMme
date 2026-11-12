import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MessageStars,
  starRecordLabel,
} from '../src/client/message-stars/index.ts';
import type { StarSync } from '../src/client/message-stars/index.ts';
import type { VaultEntry } from '../src/client/vault-sync/index.ts';

/** An in-memory vault: newest version per entity, as heads would show it. */
function vault() {
  const entries: VaultEntry[] = [],
    values = new Map<string, string>();
  let sequence = 0;
  const heads = (entity: string) => {
    const own = entries.filter((e) => e.change.entity === entity),
      superseded = new Set(own.flatMap((e) => e.change.parents));
    return own.filter((e) => !superseded.has(e.commit.id));
  };
  const sync: StarSync = {
    complete: true,
    heads,
    currentHeads: () =>
      new Map(
        [...new Set(entries.map((e) => e.change.entity))].map((entity) => [
          entity,
          heads(entity),
        ]),
      ),
    isRemoved: () => false,
    openMany: (ids) => Promise.resolve(ids.map((id) => values.get(id)!)),
    save: (input) => {
      const id = crypto.randomUUID();
      entries.push({
        commit: { id, sequence: ++sequence } as VaultEntry['commit'],
        change: input.change,
      });
      values.set(id, input.value);
      return Promise.resolve();
    },
  };
  return { sync, entries };
}

await test('stars are private vault records per message that sync across devices and list per conversation', async () => {
  const { sync, entries } = vault(),
    account = crypto.randomUUID(),
    chat = crypto.randomUUID(),
    group = crypto.randomUUID();
  const message = (conversation: string, sequence: number) => ({
    conversation,
    id: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    sequence,
    excerpt: `Message ${sequence}`,
    sentAt: 1_700_000_000_000 + sequence,
  });
  const first = message(chat, 1),
    second = message(chat, 2),
    elsewhere = message(group, 3);
  const phone = new MessageStars(sync, () => account);
  assert.equal(await phone.toggle(first), true);
  assert.equal(await phone.toggle(second), true);
  assert.equal(await phone.toggle(elsewhere), true);
  assert.equal(await phone.toggle(second), false, 'a second tap unstars');
  assert.ok(entries.every((e) => e.change.label === starRecordLabel));
  assert.ok(entries.every((e) => e.change.kind === 'settings'));

  const laptop = new MessageStars(sync, () => account);
  assert.equal(laptop.starred(first.id), false, 'unknown before reading');
  assert.equal(await laptop.load(chat, [first.id, second.id]), true);
  assert.equal(laptop.starred(first.id), true);
  assert.equal(laptop.starred(second.id), false);
  assert.deepEqual(
    (await laptop.list(chat)).map((star) => star.id),
    [first.id],
    'only starred messages of this conversation',
  );
  laptop.clear();
  assert.equal(laptop.starred(first.id), false, 'a new session forgets');
});
