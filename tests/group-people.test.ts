import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { GroupPeople } from '../src/client/groups/people.ts';
import type { ProfileCard } from '../src/client/message-profile/index.ts';
import { communityDocument } from './fixtures/community-dom.ts';

function dom(t: TestContext): void {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: communityDocument(),
  });
  t.after(() => {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else Reflect.deleteProperty(globalThis, 'document');
  });
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

await test('group authors keep the viewer nickname, otherwise show their own profile name', async (t) => {
  dom(t);
  const reads: string[] = [];
  const people = new GroupPeople((account): Promise<ProfileCard | null> => {
    reads.push(account);
    return Promise.resolve({ name: 'Own name', revision: 1, photo: null });
  });
  const [, saved] = people.sender('a', { text: 'Nickname', chosen: true });
  const [, unknown] = people.sender('b', { text: 'Member b', chosen: false });
  const [, again] = people.sender('b', { text: 'Member b', chosen: false });
  await settle();
  assert.equal(saved?.textContent, 'Nickname');
  assert.equal(unknown?.textContent, 'Own name');
  assert.equal(again?.textContent, 'Own name');
  assert.equal(people.knownName('b'), 'Own name');
  assert.deepEqual(reads, ['a', 'b'], 'one card read per member');
  people.clear();
  assert.equal(people.knownName('b'), '');
});
