import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferred } from './fixtures/deferred.ts';
import { discoveryFixture, settled } from './fixtures/discovery-ui.ts';

for (const language of ['en', 'zh-CN'] as const) {
  await test(`refresh pill offers a feed-only reload after deep scrolling in ${language}`, async (t) => {
    const fixture = discoveryFixture({ language });
    t.after(() => fixture.ui.leave());
    await settled(fixture);
    const pill = fixture.host.querySelector('.feed-refresh')!;
    assert.equal(pill.hidden, true);
    fixture.scroll(1000);
    fixture.scroll(0);
    await settled(fixture);
    assert.equal(pill.hidden, false);
    assert.ok(pill.textContent.includes(fixture.t('feed.refresh')));
    fixture.scroll(401);
    assert.equal(pill.hidden, true);
    fixture.scroll(1000);
    await fixture.ui.tabAgain();
    assert.equal(fixture.host.scrollTop, 0);
    assert.equal(pill.hidden, false);
    await settled(fixture);
    const reads = fixture.requests.length;
    pill.querySelector('button')!.click();
    await settled(fixture);
    assert.equal(fixture.requests.length, reads + 1);
    assert.equal(fixture.requests.at(-1)?.after, null);
    assert.equal(pill.hidden, true);
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
