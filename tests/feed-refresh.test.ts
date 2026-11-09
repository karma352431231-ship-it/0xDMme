import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FeedEntry } from '../src/shared/community-discovery/index.ts';
import { deferred } from './fixtures/deferred.ts';
import { discoveryFixture, settled } from './fixtures/discovery-ui.ts';

function newerEntry(entry: FeedEntry): FeedEntry {
  return {
    ...entry,
    post: {
      ...entry.post,
      id: crypto.randomUUID(),
      createdAt: '2026-10-15T13:00:00.000Z',
    },
  };
}

for (const language of ['en', 'zh-CN'] as const) {
  await test(`refresh pill stays hidden without new posts and reloads confirmed posts in ${language}`, async (t) => {
    const fixture = discoveryFixture({ language });
    t.after(() => fixture.ui.leave());
    await settled(fixture);
    const pill = fixture.host.querySelector('.feed-refresh')!;
    const entry = fixture.state.feed.items[0]!;
    entry.post.score++;
    entry.post.replies++;
    fixture.scroll(1000);
    fixture.scroll(0);
    assert.equal(pill.hidden, true);
    await settled(fixture);
    assert.equal(pill.hidden, true);
    const checked = fixture.requests.length;
    fixture.scroll(1);
    fixture.scroll(2);
    await settled(fixture);
    assert.equal(fixture.requests.length, checked);
    fixture.scroll(1000);
    await fixture.ui.tabAgain();
    assert.equal(fixture.host.scrollTop, 0);
    await settled(fixture);
    assert.equal(pill.hidden, true);

    fixture.state.feed.items.unshift(newerEntry(entry));
    fixture.scroll(1000);
    fixture.scroll(0);
    assert.equal(pill.hidden, true);
    await settled(fixture);
    assert.equal(pill.hidden, false);
    assert.ok(pill.textContent.includes(fixture.t('feed.posted')));
    const reads = fixture.requests.length;
    pill.querySelector('button')!.click();
    await settled(fixture);
    assert.equal(fixture.requests.length, reads + 1);
    assert.equal(fixture.requests.at(-1)?.after, null);
    assert.equal(pill.hidden, true);
    fixture.scroll(1000);
    fixture.scroll(0);
    await settled(fixture);
    assert.equal(pill.hidden, true);
  });
}

for (const outcome of ['unchanged', 'failure'] as const) {
  await test(`a pending or ${outcome} new-post check never offers a refresh`, async (t) => {
    const fixture = discoveryFixture();
    t.after(() => fixture.ui.leave());
    await settled(fixture);
    const pending = deferred<unknown>();
    fixture.state.reply = () => pending.promise;
    fixture.scroll(1000);
    fixture.scroll(0);
    const pill = fixture.host.querySelector('.feed-refresh')!;
    assert.equal(pill.hidden, true);
    const tick = [...fixture.intervals.values()][0]!;
    tick();
    assert.equal(fixture.requests.length, 2);
    if (outcome === 'failure') pending.reject(new Error('Network unavailable'));
    else pending.resolve(fixture.state.feed);
    await settled(fixture);
    assert.equal(pill.hidden, true);

    fixture.state.reply = null;
    const entry = fixture.state.feed.items[0]!;
    fixture.state.feed.items = [newerEntry(entry)];
    tick();
    await settled(fixture);
    assert.equal(pill.hidden, false);
  });
}

await test('new-post checks are single-flight, bound author faces and stop on leave', async (t) => {
  const fixture = discoveryFixture();
  t.after(() => fixture.ui.leave());
  await settled(fixture);
  const entry = fixture.state.feed.items[0]!;
  fixture.state.feed.items = Array.from({ length: 4 }, (_, index) => ({
    ...entry,
    post: {
      ...entry.post,
      id: crypto.randomUUID(),
      createdAt: '2026-10-15T13:00:00.000Z',
      author: {
        id: crypto.randomUUID(),
        handle: 'author_' + index,
        avatar: null,
      },
    },
  }));
  const pending = deferred<unknown>();
  fixture.state.reply = () => pending.promise;
  fixture.scroll(1000);
  const tick = [...fixture.intervals.values()][0]!;
  tick();
  tick();
  assert.equal(fixture.requests.length, 2);
  pending.resolve(fixture.state.feed);
  await settled(fixture);
  const pill = fixture.host.querySelector('.feed-refresh')!;
  assert.equal(pill.hidden, false);
  assert.equal(pill.querySelectorAll('.feed-refresh-face').length, 3);
  assert.ok(pill.textContent.includes(fixture.t('feed.posted')));
  fixture.scroll(2000);
  assert.equal(pill.hidden, false);
  fixture.ui.leave();
  assert.equal(fixture.intervals.size, 0);
  assert.equal(pill.querySelectorAll('.feed-refresh-face').length, 0);
});

await test('late new-post checks cannot show a pill after leaving', async () => {
  const fixture = discoveryFixture();
  await settled(fixture);
  const pending = deferred<unknown>();
  fixture.state.reply = () => pending.promise;
  fixture.scroll(1000);
  [...fixture.intervals.values()][0]!();
  const pill = fixture.host.querySelector('.feed-refresh')!;
  fixture.ui.leave();
  fixture.state.feed.items[0]!.post.createdAt = '2026-10-15T13:00:00.000Z';
  pending.resolve(fixture.state.feed);
  await settled(fixture);
  assert.equal(pill.hidden, true);
  assert.equal(fixture.intervals.size, 0);
});

await test('a later empty check removes a previously confirmed new-post indicator', async (t) => {
  const fixture = discoveryFixture();
  t.after(() => fixture.ui.leave());
  await settled(fixture);
  const original = fixture.state.feed.items[0]!;
  fixture.state.feed.items = [newerEntry(original)];
  fixture.scroll(1000);
  const tick = [...fixture.intervals.values()][0]!;
  tick();
  await settled(fixture);
  const pill = fixture.host.querySelector('.feed-refresh')!;
  assert.equal(pill.hidden, false);
  fixture.state.feed.items = [original];
  tick();
  await settled(fixture);
  assert.equal(pill.hidden, true);
  assert.equal(pill.querySelectorAll('.feed-refresh-face').length, 0);
});

await test('a check started before loading new posts cannot restore the indicator afterward', async (t) => {
  const fixture = discoveryFixture();
  t.after(() => fixture.ui.leave());
  await settled(fixture);
  const entry = fixture.state.feed.items[0]!;
  fixture.state.feed.items = [newerEntry(entry)];
  fixture.scroll(1000);
  const tick = [...fixture.intervals.values()][0]!;
  tick();
  await settled(fixture);
  const pill = fixture.host.querySelector('.feed-refresh')!;
  assert.equal(pill.hidden, false);
  const pending = deferred<unknown>();
  fixture.state.reply = () => pending.promise;
  tick();
  fixture.state.reply = null;
  pill.querySelector('button')!.click();
  await settled(fixture);
  pending.resolve(fixture.state.feed);
  await settled(fixture);
  assert.equal(pill.hidden, true);
});
