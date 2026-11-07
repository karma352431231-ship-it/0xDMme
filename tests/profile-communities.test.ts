import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { profileCommunities } from '../src/client/public-profile/communities-panel.ts';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';

class ProfileNode extends CommunityNode {}
function installDocument(context: TestContext): void {
  const document = Object.assign(communityDocument(), {
    createElement: (tag: string) => new ProfileNode(tag),
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
  });
  context.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
}
function fixture(count: number) {
  const host = new ProfileNode();
  const items = Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    name: `Community ${index + 1}`,
    description: '',
    rules: '',
    revision: 1,
    archived: false,
    avatar: null,
    owner: null,
    followers: 0,
  }));
  const signal = new AbortController().signal;
  return { host, items, signal };
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

const read = (f: ReturnType<typeof fixture>) => () =>
  Promise.resolve({ items: f.items, next: null });
const failed = (error: unknown) => {
  throw error;
};

await test('the Communities tab names every followed community of the page', async (context) => {
  installDocument(context);
  const f = fixture(7);
  profileCommunities(f.host as unknown as HTMLElement, {
    read: read(f),
    signal: f.signal,
    error: failed,
  });
  await turn();
  const list = f.host.querySelector('.profile-communities-list')!;
  assert.equal(list.children.length, 7);
  for (const item of f.items) assert.ok(list.textContent.includes(item.name));
  assert.equal(f.host.querySelector('.profile-communities-more')?.hidden, true);
});

await test('further pages append without duplicate rows', async (context) => {
  installDocument(context);
  const f = fixture(7);
  const next = crypto.randomUUID();
  const calls: (string | null)[] = [];
  profileCommunities(f.host as unknown as HTMLElement, {
    read: (after) => {
      calls.push(after);
      return Promise.resolve(
        after
          ? { items: f.items.slice(5), next: null }
          : { items: f.items.slice(0, 5), next },
      );
    },
    signal: f.signal,
    error: failed,
  });
  await turn();
  const list = f.host.querySelector('.profile-communities-list')!;
  const more = f.host.querySelector('.profile-communities-more')!;
  assert.equal(list.children.length, 5);
  assert.equal(more.hidden, false);
  more.click();
  await turn();
  assert.equal(list.children.length, 7);
  assert.deepEqual(calls, [null, next]);
  assert.equal(more.hidden, true);
});

await test('a profile without communities says so', async (context) => {
  installDocument(context);
  const f = fixture(0);
  profileCommunities(f.host as unknown as HTMLElement, {
    read: read(f),
    signal: f.signal,
    error: failed,
  });
  await turn();
  assert.equal(f.host.querySelector('.profile-communities-list'), null);
  assert.ok(f.host.querySelector('.public-profile-empty'));
});
