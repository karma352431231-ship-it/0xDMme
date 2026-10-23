import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { deferred } from './fixtures/deferred.ts';
import {
  button,
  discoveryFixture,
  groupId,
  settled,
} from './fixtures/discovery-ui.ts';

await test('post-list rechecks retain unchanged cards and release their media on replacement and departure', async (t) => {
  const fixture = discoveryFixture();
  const posts = fixture.posts();
  t.after(() => {
    posts.leave();
    fixture.ui.leave();
  });
  await settled(fixture);
  fixture.ui.leave();
  fixture.host.replaceChildren();
  const post = fixture.state.feed.items[0]!.post;
  post.author = {
    ...post.author!,
    avatar: `/api/public-media/avatar/${post.author!.id}/${crypto.randomUUID()}`,
  };
  posts.mount(fixture.host as unknown as HTMLElement, {
    community: groupId,
    identity: { id: groupId, name: 'Synthetic community', avatar: null },
    state: null,
    post: null,
    tag: null,
  });
  for (let count = 0; count < 10; count++) await setImmediate();
  const card = fixture.host.querySelector('.community-post');
  assert.ok(card, fixture.host.textContent);
  const retained = new Map(fixture.media);
  assert.ok(retained.size > 0);
  await posts.refresh();
  assert.equal(fixture.host.querySelector('.community-post'), card);
  for (const node of retained.keys()) assert.ok(fixture.media.has(node));
  fixture.state.feed.items[0]!.post.text = 'Confirmed changed content';
  await posts.refresh();
  assert.notEqual(fixture.host.querySelector('.community-post'), card);
  for (const node of retained.keys()) assert.ok(!fixture.media.has(node));
  posts.leave();
  assert.equal(fixture.media.size, 0);
});

await test('leaving tag management isolates late reads from the next screen', async (t) => {
  const fixture = discoveryFixture();
  const posts = fixture.posts();
  t.after(() => {
    posts.leave();
    fixture.ui.leave();
  });
  await settled(fixture);
  fixture.ui.leave();
  fixture.host.replaceChildren();
  const read = deferred<unknown>();
  let reads = 0;
  fixture.state.request = () =>
    ++reads === 1 ? read.promise : Promise.resolve({ items: [], next: null });
  posts.manageTags(fixture.host as unknown as HTMLElement, groupId);
  posts.leave();
  fixture.host.replaceChildren();
  posts.manageTags(fixture.host as unknown as HTMLElement, crypto.randomUUID());
  await setImmediate();
  const next = fixture.host.textContent;
  read.reject(new Error('Abandoned request'));
  await setImmediate();
  assert.equal(fixture.host.textContent, next);
});

await test('tag creation retains its operation ID after failure and replaces it after confirmation', async (t) => {
  const fixture = discoveryFixture();
  const posts = fixture.posts();
  t.after(() => {
    posts.leave();
    fixture.ui.leave();
  });
  await settled(fixture);
  fixture.ui.leave();
  fixture.host.replaceChildren();
  const operations: Record<string, unknown>[] = [];
  fixture.state.request = (operation, data) => {
    if (operation === 'tag-list')
      return Promise.resolve({ items: [], next: null });
    operations.push(data);
    return operations.length === 1
      ? Promise.reject(new Error('Lost response'))
      : Promise.resolve({ saved: true });
  };
  posts.manageTags(fixture.host as unknown as HTMLElement, groupId);
  await setImmediate();
  const create = button(fixture.host, fixture.t('Create tag'));
  for (let attempt = 0; attempt < 3; attempt++) {
    create.click();
    await setImmediate();
  }
  assert.equal(operations.length, 3);
  assert.equal(operations[0]!['tag'], operations[1]!['tag']);
  assert.notEqual(operations[1]!['tag'], operations[2]!['tag']);
});
