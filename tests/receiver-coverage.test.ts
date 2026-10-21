import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  receiverOwnsAdvance,
  windowBehind,
} from '../src/client/messages/receiver-coverage.ts';
import type { MessageSyncSnapshot } from '../src/shared/message-sync/index.ts';

const base: MessageSyncSnapshot = {
  version: 2,
  account: crypto.randomUUID(),
  device: crypto.randomUUID(),
  revision: 4,
  anchor: 4,
  invalidation: 0,
  directory: 'a'.repeat(64),
  contacts: 0,
  source: 'journal',
};
const at = (revision: number, change: Partial<MessageSyncSnapshot> = {}) => ({
  ...base,
  revision,
  anchor: revision,
  ...change,
});

await test('only an append-only advance on the receiver chain is handed to the account receiver', () => {
  const window = JSON.stringify(at(4));
  const cases: {
    name: string;
    probed: unknown;
    receiver: MessageSyncSnapshot | null;
    owns: boolean;
  }[] = [
    {
      name: 'append, receiver idle',
      probed: at(6),
      receiver: null,
      owns: true,
    },
    {
      name: 'append, receiver behind',
      probed: at(6),
      receiver: at(2),
      owns: true,
    },
    {
      name: 'append, receiver at window',
      probed: at(6),
      receiver: at(4),
      owns: true,
    },
    {
      name: 'receiver passed window',
      probed: at(6),
      receiver: at(5),
      owns: false,
    },
    {
      name: 'removal fence',
      probed: at(6, { invalidation: 5 }),
      receiver: null,
      owns: false,
    },
    {
      name: 'directory change',
      probed: at(6, { directory: 'b'.repeat(64) }),
      receiver: null,
      owns: false,
    },
    {
      name: 'legacy snapshot',
      probed: { revision: 6 },
      receiver: null,
      owns: false,
    },
  ];
  for (const { name, probed, receiver, owns } of cases)
    assert.equal(receiverOwnsAdvance({ window, probed, receiver }), owns, name);
  assert.equal(
    receiverOwnsAdvance({
      window: JSON.stringify({ revision: 4 }),
      probed: at(6),
      receiver: null,
    }),
    false,
    'legacy window',
  );
});

await test('a completed cut past the open window marks it behind', () => {
  assert.equal(windowBehind(JSON.stringify(at(4)), at(5)), true);
  assert.equal(windowBehind(JSON.stringify(at(5)), at(5)), false);
  assert.equal(windowBehind(JSON.stringify(at(6)), at(5)), false);
  assert.equal(windowBehind(JSON.stringify({ revision: 1 }), at(5)), false);
});
