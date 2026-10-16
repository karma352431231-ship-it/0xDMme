import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferred } from './fixtures/deferred.ts';
import {
  button,
  discoveryFixture,
  groupId,
  settled,
} from './fixtures/discovery-ui.ts';
import type { AppLanguage } from '../src/shared/i18n/index.ts';

for (const language of [
  'en',
  'zh-CN',
] as const satisfies readonly AppLanguage[]) {
  await test(`ranking preserves names, columns and page positions in ${language}`, async (t) => {
    const fixture = discoveryFixture({ view: 'explore', language });
    t.after(() => fixture.ui.leave());
    const { host, state, ui, requests } = fixture;
    const first = state.ranking.items[0]!;
    state.ranking.items.push({
      ...first,
      community: {
        ...first.community,
        id: crypto.randomUUID(),
        name: 'Second',
      },
      historyComplete: false,
    });
    const cursor = JSON.stringify({
      generation: state.ranking.generation,
      rank: 2,
      id: groupId,
      filter: 'trending/day',
    });
    state.ranking.next = cursor;
    await settled(fixture);
    const rows = host.querySelectorAll('.ranking-row');
    assert.equal(rows.length, 2, host.textContent);
    assert.equal(rows[0]!.querySelector('.ranking-position')?.textContent, '1');
    assert.equal(rows[1]!.querySelector('.ranking-position')?.textContent, '2');
    assert.ok(rows[0]!.textContent.includes('Untranslated community'));
    assert.ok(rows[0]!.textContent.includes('Untranslated description'));
    assert.deepEqual(
      rows[0]!
        .querySelectorAll('.ranking-stat')
        .map((node) => node.textContent),
      [
        (1234).toLocaleString(language) + fixture.t('seguidores'),
        '8' + fixture.t('ranking.active-label'),
        '+6' + fixture.t('upvotes em alta'),
      ],
    );
    assert.equal(
      rows[1]!.querySelector('.ranking-growth')?.textContent,
      '+6' + fixture.t('em formação'),
    );
    await ui.refresh();
    assert.equal(host.querySelector('.ranking-row'), rows[0]);
    state.ranking.items = [first];
    state.ranking.next = null;
    button(host, fixture.t('Próxima página')).click();
    await settled(fixture);
    const third = host.querySelector('.ranking-row');
    assert.equal(third?.querySelector('.ranking-position')?.textContent, '3');
    await ui.refresh();
    assert.equal(host.querySelector('.ranking-row'), third);
    assert.equal(requests.at(-1)?.after, cursor);
    button(host, fixture.t('Maiores')).click();
    await settled(fixture);
    assert.equal(host.querySelector('.ranking-position')?.textContent, '1');
    assert.equal(host.querySelectorAll('.ranking-stat').length, 1);
    assert.equal(requests.at(-1)?.order, 'size');
  });

  await test(`feed preserves viewer controls, deduplication and page on recheck in ${language}`, async (t) => {
    const fixture = discoveryFixture({ signedIn: true, language });
    t.after(() => fixture.ui.leave());
    const { host, state, ui } = fixture;
    await settled(fixture);
    state.feed.items.push(state.feed.items[0]!);
    await ui.refresh();
    assert.equal(host.querySelectorAll('.community-post').length, 1);
    const row = host.querySelector('.community-post')!;
    assert.ok(row.textContent.includes('Untranslated content'));
    assert.equal(
      row.querySelector('.post-save')?.getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      row.querySelector('.post-share')?.getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      row
        .querySelector('.post-votes')
        ?.children[0]?.getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      row.querySelector('.post-comments')?.getAttribute('aria-label'),
      fixture.t('Responder à postagem'),
    );
    const pending = deferred<unknown>();
    state.reply = () => pending.promise;
    const refresh = ui.refresh();
    assert.equal(host.querySelector('.community-post'), row);
    pending.resolve(state.feed);
    await refresh;
    assert.equal(host.querySelector('.community-post'), row);
  });
}

await test('late page and card actions cannot restore or mutate an abandoned feed', async (t) => {
  const fixture = discoveryFixture({ signedIn: true });
  t.after(() => fixture.ui.leave());
  await settled(fixture);
  const pending = deferred<unknown>();
  fixture.state.request = () => pending.promise;
  const votes = fixture.host.querySelector('.post-votes')!;
  votes.children[0]!.click();
  await new Promise<void>((resolve) => setImmediate(resolve));
  fixture.ui.leave();
  pending.resolve({
    post: fixture.state.feed.items[0]!.post,
    own: false,
    manager: false,
    canEdit: false,
    canDelete: false,
    content: null,
    removal: null,
    vote: { position: 1, revision: 1 },
  });
  await settled(fixture);
  assert.deepEqual(fixture.state.operations, ['discovery-feed', 'post-state']);
  const page = deferred<unknown>();
  fixture.state.reply = () => page.promise;
  fixture.mount();
  fixture.ui.leave();
  fixture.host.replaceChildren();
  page.resolve(fixture.state.feed);
  await settled(fixture);
  assert.equal(fixture.host.children.length, 0);
});

await test('ranking media is retained on identical rechecks and released on replacement and leave', async (t) => {
  const fixture = discoveryFixture({ view: 'explore' });
  t.after(() => fixture.ui.leave());
  fixture.state.ranking.items[0]!.community.avatar = `/api/public-media/community-photo/${groupId}/${crypto.randomUUID()}`;
  await settled(fixture);
  assert.equal(fixture.media.size, 1, fixture.host.textContent);
  const original = [...fixture.media.keys()][0]!;
  await fixture.ui.refresh();
  assert.ok(fixture.media.has(original));
  fixture.state.ranking.items[0]!.community.description = 'Updated';
  await fixture.ui.refresh();
  assert.equal(fixture.media.has(original), false);
  assert.equal(fixture.media.size, 1);
  const lifetime = [...fixture.media.values()][0]!;
  fixture.ui.leave();
  assert.equal(fixture.media.size, 0);
  assert.equal(lifetime.aborted, true);
});
