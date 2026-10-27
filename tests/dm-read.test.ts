import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readVisibleDm } from '../src/client/communities/dm-read.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
import { deferred } from './fixtures/deferred.ts';
import type { VaultWorkOptions } from '../src/client/vault-authority/index.ts';

await test('public read markers advance only for a still-visible received window after acknowledgement', async (t) => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { visibilityState: 'visible' },
  });
  t.after(() => {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  let visible = false,
    updates = 0;
  const priorities: VaultWorkOptions['priority'][] = [];
  const marks: number[] = [],
    acknowledgements: string[][] = [],
    ownerships: string[][] = [];
  const held = deferred<void>();
  let hold = false;
  const input = {
    history: new ChatNode() as unknown as HTMLElement,
    controller: {
      messageStates: async (
        { read, own }: { peer: string; read: string[]; own: string[] },
        options?: VaultWorkOptions,
      ) => {
        priorities.push(options?.priority);
        acknowledgements.push(read);
        ownerships.push(own);
        if (hold) await held.promise;
        return [];
      },
      markRead: (
        _peer: string,
        sequence: number,
        options?: VaultWorkOptions,
      ) => {
        priorities.push(options?.priority);
        marks.push(sequence);
        return Promise.resolve();
      },
    },
    peer: 'peer',
    work: { priority: 'interactive' as const },
    page: {
      items: [
        { id: 'incoming', own: false, sequence: 3 },
        { id: 'own', own: true, sequence: 4 },
        { id: 'imported-incoming', own: false, sequence: 100, localOnly: true },
        { id: 'imported-own', own: true, sequence: 101, localOnly: true },
      ],
      reactionReads: [],
    },
    usable: () => visible,
    changed: () => {
      updates++;
    },
  };
  await readVisibleDm(input);
  assert.deepEqual(acknowledgements, []);
  visible = true;
  await readVisibleDm(input);
  assert.deepEqual(acknowledgements, [['incoming']]);
  assert.deepEqual(ownerships, [['own']]);
  assert.deepEqual(marks, [3]);
  assert.equal(updates, 1);
  assert.deepEqual(priorities, ['interactive', 'interactive']);
  hold = true;
  const reading = readVisibleDm(input);
  await Promise.resolve();
  visible = false;
  held.resolve();
  await reading;
  assert.deepEqual(marks, [3]);
  assert.equal(updates, 1);
});
