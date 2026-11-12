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

await test('"You" and unnamed members show a person until a profile name is known', async (t) => {
  dom(t);
  const people = new GroupPeople((account): Promise<ProfileCard | null> =>
    Promise.resolve(
      account === 'self'
        ? { name: 'Own name', revision: 1, photo: null }
        : null,
    ),
  );
  const [self, selfName] = people.sender('self', {
    text: 'You',
    chosen: true,
    placeholder: true,
  });
  const [unknown] = people.sender('other', {
    text: 'Member other',
    chosen: false,
    placeholder: true,
  });
  const [nickname] = people.sender('self', { text: 'Nick', chosen: true });
  assert.equal(self?.textContent, '', 'a person glyph, not "YO"');
  await settle();
  assert.equal(selfName?.textContent, 'You', 'the chosen label stays');
  assert.equal(self?.textContent, 'ON', 'initials of the own profile name');
  assert.equal(unknown?.textContent, '', 'no card keeps the person glyph');
  assert.equal(nickname?.textContent, 'NI', 'a nickname keeps its initials');
});
