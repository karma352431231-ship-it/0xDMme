import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { profileCommunities } from '../src/client/public-profile/communities-panel.ts';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';

class ProfileNode extends CommunityNode {
  get childElementCount(): number {
    return this.children.length;
  }
  focus(): void {
    this.dispatchEvent(new Event('focus'));
  }
}
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

await test('one to three followed communities show names immediately without a toggle', async (context) => {
  installDocument(context);
  for (const count of [1, 2, 3]) {
    const f = fixture(count);
    profileCommunities(f.host as unknown as HTMLElement, {
      total: count + 10,
      read: () => Promise.resolve({ items: f.items, next: null }),
      signal: f.signal,
      error: (error) => {
        throw error;
      },
    });
    await turn();
    const list = f.host.querySelector('.profile-communities-list')!;
    assert.equal(list.hidden, false);
    assert.equal(list.children.length, count);
    for (const item of f.items) assert.ok(list.textContent.includes(item.name));
    assert.equal(
      f.host.querySelector('.profile-communities-compact')?.hidden,
      true,
    );
    assert.equal(
      f.host.querySelector('.profile-communities-footer')?.hidden,
      true,
    );
  }
});

await test('larger collections expand/collapse names and keep pagination without duplicate rows', async (context) => {
  installDocument(context);
  const f = fixture(7);
  const next = crypto.randomUUID();
  const calls: (string | null)[] = [];
  profileCommunities(f.host as unknown as HTMLElement, {
    total: 7,
    read: (after) => {
      calls.push(after);
      return Promise.resolve(
        after
          ? { items: f.items.slice(5), next: null }
          : { items: f.items.slice(0, 5), next },
      );
    },
    signal: f.signal,
    error: (error) => {
      throw error;
    },
  });
  await turn();
  const list = f.host.querySelector('.profile-communities-list')!;
  const compact = f.host.querySelector('.profile-communities-compact')!;
  const toggle = f.host.querySelector('.profile-communities-toggle')!;
  assert.equal(list.hidden, true);
  assert.equal(toggle.textContent, '+2');
  toggle.click();
  assert.equal(list.children.length, 5);
  assert.equal(list.hidden, false);
  f.host.querySelector('.profile-communities-more')!.click();
  await turn();
  assert.equal(list.children.length, 7);
  assert.deepEqual(calls, [null, next]);
  f.host.querySelector('.profile-communities-less')!.click();
  assert.equal(compact.hidden, false);
  toggle.click();
  assert.equal(list.children.length, 7);
});

await test('stale summary counts cannot hide an incomplete named community page', async (context) => {
  installDocument(context);
  const f = fixture(1);
  profileCommunities(f.host as unknown as HTMLElement, {
    total: 1,
    read: () => Promise.resolve({ items: f.items, next: crypto.randomUUID() }),
    signal: f.signal,
    error: (error) => {
      throw error;
    },
  });
  await turn();
  assert.equal(f.host.querySelector('.profile-communities-list')?.hidden, true);
  assert.equal(
    f.host.querySelector('.profile-communities-toggle')?.textContent,
    'View names',
  );
});
