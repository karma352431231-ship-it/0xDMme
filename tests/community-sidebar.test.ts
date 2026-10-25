import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CommunityDirectory } from '../src/client/communities/directory-refresh.ts';
import type { CommunityPage } from '../src/shared/communities/index.ts';
import { communityDocument, CommunityNode } from './fixtures/community-dom.ts';

const page = (...names: string[]): CommunityPage => ({
  items: names.map((name) => ({
    id: crypto.randomUUID(),
    name,
    description: '',
    rules: '',
    revision: 1,
    archived: false,
    avatar: null,
    owner: null,
    followers: 0,
  })),
  next: null,
});

await test('created communities sit above Following, and the section stays when there are none', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: communityDocument(),
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  for (const [created, expected] of [
    [page('Mine'), ['Created by you', 'row:Mine', 'Following', 'row:Followed']],
    [page(), ['Created by you', 'Following', 'row:Followed']],
  ] as const) {
    const host = new CommunityNode('aside');
    const directory = new CommunityDirectory({
      load: () => Promise.resolve(page('Followed')),
      created: () => Promise.resolve(created),
      rows: (target, rows) => {
        for (const item of rows.items) {
          const row = new CommunityNode('div');
          row.textContent = 'row:' + item.name;
          target.append(row as unknown as HTMLElement);
        }
      },
      release: () => undefined,
      run: (work) => work(),
    });
    await directory.refresh({
      host: host as unknown as HTMLElement,
      view: 'feed',
      selected: null,
      signedIn: true,
      valid: () => true,
    });
    // Skip the head, tabs and links; compare the sections below them.
    assert.deepEqual(
      host.children.slice(3).map((node) => node.textContent),
      expected,
    );
  }
});
