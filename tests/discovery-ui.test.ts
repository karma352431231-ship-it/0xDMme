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
import { CommunityNode } from './fixtures/community-dom.ts';

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
      '+6' + fixture.t('upvotes em alta'),
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

await test('feed card photos are disposed on replacement and leave', async (t) => {
  const fixture = discoveryFixture();
  t.after(() => fixture.ui.leave());
  const post = fixture.state.feed.items[0]!.post;
  post.author = {
    ...post.author!,
    avatar: `/api/public-media/avatar/${post.author!.id}/${crypto.randomUUID()}`,
  };
  await settled(fixture);
  assert.equal(fixture.media.size, 1);
  const original = [...fixture.media.keys()][0]!;
  post.text = 'Updated public text';
  await fixture.ui.refresh();
  assert.equal(fixture.media.has(original), false);
  assert.equal(fixture.media.size, 1);
  fixture.ui.leave();
  assert.equal(fixture.media.size, 0);
});

await test('hiding a feed card uses the existing preference operation and reloads confirmed data', async (t) => {
  const fixture = discoveryFixture({ signedIn: true });
  t.after(() => fixture.ui.leave());
  await settled(fixture);
  fixture.state.request = (operation) => {
    const hidden = operation === 'discovery-preference-set';
    if (hidden) fixture.state.feed.items = [];
    return Promise.resolve({ saved: true, hidden, revision: hidden ? 8 : 7 });
  };
  button(fixture.host, fixture.t('Ocultar ou mostrar nos meus feeds')).click();
  await settled(fixture);
  assert.deepEqual(fixture.state.operations, [
    'discovery-feed',
    'discovery-preference',
    'discovery-preference-set',
    'discovery-feed',
  ]);
  assert.equal(fixture.host.querySelector('.community-post'), null);
});

await test('confirmed feed votes preserve the displayed page, scroll, card and draft', async (t) => {
  const fixture = discoveryFixture({ signedIn: true });
  t.after(() => fixture.ui.leave());
  const cursor = JSON.stringify({
    filter: 'all/mixed/day',
    anchor: '2026-10-15T12:00:00.000Z',
    rank: 1,
    time: '2026-10-15T12:00:00.000Z',
    id: crypto.randomUUID(),
  });
  fixture.state.feed.next = cursor;
  await settled(fixture);
  fixture.state.feed.next = null;
  fixture.state.feed.items[0]!.viewerVote = 0;
  button(fixture.host, fixture.t('Próxima página')).click();
  await settled(fixture);
  assert.equal(fixture.ui.bookmark()?.after, cursor);
  const card = fixture.host.querySelector('.community-post')!,
    votes = card.querySelector('.post-votes')!,
    draft = new CommunityNode('textarea');
  draft.value = 'Keep this draft';
  card.append(draft);
  fixture.host.scrollTop = 900;
  const reads = fixture.requests.length;
  let current = { position: 0, score: 5 };
  let confirmed = current;
  fixture.state.request = (operation) => {
    if (operation === 'post-vote') current = confirmed;
    else assert.equal(operation, 'post-state');
    return Promise.resolve({
      post: { ...fixture.state.feed.items[0]!.post, score: current.score },
      own: false,
      manager: false,
      canEdit: false,
      canDelete: false,
      content: null,
      removal: null,
      vote: { position: current.position, revision: 1 },
    });
  };
  for (const [clicked, position, score] of [
    [1, 1, 6],
    [-1, -1, 4],
    [-1, 0, 5],
  ] as const) {
    confirmed = { position, score };
    const target = votes
      .querySelectorAll('button')
      .find((node) => node.dataset['vote'] === String(clicked))!;
    target.click();
    await settled(fixture);
    assert.equal(fixture.host.scrollTop, 900);
    assert.equal(fixture.ui.bookmark()?.after, cursor);
    assert.equal(fixture.requests.length, reads);
    assert.equal(fixture.host.querySelector('.community-post'), card);
    assert.equal(draft.parent, card);
    assert.equal(draft.value, 'Keep this draft');
    assert.equal(card.querySelector('.post-score')?.textContent, String(score));
    assert.equal(
      target.getAttribute('aria-pressed'),
      String(clicked === position),
    );
  }
});

await test('deleted and moderated feed cards preserve their notices and omit content and votes', async (t) => {
  for (const status of ['deleted', 'removed'] as const) {
    const fixture = discoveryFixture();
    t.after(() => fixture.ui.leave());
    Object.assign(fixture.state.feed.items[0]!.post, {
      status,
      author: null,
      title: '',
      text: '',
      revision: 2,
    });
    await settled(fixture);
    assert.ok(
      fixture.host.textContent.includes(
        fixture.t(
          status === 'deleted'
            ? 'Conteúdo excluído pelo autor.'
            : 'Conteúdo ocultado pela moderação.',
        ),
      ),
    );
    assert.equal(fixture.host.querySelector('.community-text'), null);
    assert.equal(fixture.host.querySelector('.post-votes'), null);
  }
});

await test('Discover starts at 24 hours and respects an explicit period choice', async (t) => {
  const fixture = discoveryFixture();
  t.after(() => fixture.ui.leave());
  await settled(fixture);
  assert.equal(fixture.ui.bookmark()?.period, 'day');
  button(fixture.host, fixture.t('Todo o histórico')).click();
  await settled(fixture);
  assert.equal(fixture.ui.bookmark()?.period, 'all');
  assert.ok(fixture.requests.length >= 2);
});

for (const language of ['en', 'zh-CN'] as const) {
  await test(`account ranking owns windows, bounded pages, errors and public identity in ${language}`, async (t) => {
    const fixture = discoveryFixture({ view: 'explore', language });
    t.after(() => fixture.ui.leave());
    await settled(fixture);
    const { host, state, ui } = fixture;
    button(host, fixture.t('ranking.users')).click();
    await settled(fixture);
    assert.equal(
      state.accountRequests.at(-1)!.searchParams.get('period'),
      'day',
    );
    const accountPanel = host.querySelector('.account-ranking')!;
    assert.equal(accountPanel.hidden, false);
    assert.ok(accountPanel.textContent.includes('@synthetic_author'));
    assert.ok(
      accountPanel.textContent.includes(fixture.t('ranking.partial-history')),
    );
    const oldRow = accountPanel.querySelector('.account-ranking-row');
    await ui.refresh();
    assert.equal(accountPanel.querySelector('.account-ranking-row'), oldRow);
    const cursor = JSON.stringify({
      generation: state.accounts.generation,
      rank: 1,
      id: state.accounts.items[0]!.profile.id,
      filter: 'accounts/day',
    });
    state.accounts.next = cursor;
    await ui.refresh();
    state.accounts.items = [
      {
        ...state.accounts.items[0]!,
        profile: { ...state.accounts.items[0]!.profile, handle: 'page_two' },
      },
    ];
    state.accounts.next = null;
    button(accountPanel, fixture.t('Próxima página')).click();
    await settled(fixture);
    assert.equal(
      accountPanel.querySelectorAll('.account-ranking-row').length,
      1,
    );
    assert.ok(accountPanel.textContent.includes('@page_two'));
    assert.ok(!accountPanel.textContent.includes('@synthetic_author'));
    await ui.refresh();
    assert.equal(
      state.accountRequests.at(-1)!.searchParams.get('after'),
      cursor,
    );
    button(accountPanel, fixture.t('30 dias')).click();
    await settled(fixture);
    assert.equal(
      state.accountRequests.at(-1)!.searchParams.get('period'),
      'month',
    );
    assert.equal(state.accountRequests.at(-1)!.searchParams.get('after'), null);
    button(accountPanel, fixture.t('7 dias')).click();
    await settled(fixture);
    assert.equal(
      state.accountRequests.at(-1)!.searchParams.get('period'),
      'week',
    );
    button(accountPanel, fixture.t('ranking.reload')).click();
    await settled(fixture);
    assert.equal(state.accountRequests.at(-1)!.searchParams.get('after'), null);
    button(host, fixture.t('ranking.title')).click();
    assert.equal(accountPanel.hidden, true);
  });
  await test(`late account window results cannot overwrite the new selection in ${language}`, async (t) => {
    const fixture = discoveryFixture({ view: 'explore', language });
    t.after(() => fixture.ui.leave());
    await settled(fixture);
    const wait = deferred<unknown>();
    fixture.state.accountReply = () => wait.promise;
    button(fixture.host, fixture.t('ranking.users')).click();
    await Promise.resolve();
    fixture.state.accountReply = null;
    const panel = fixture.host.querySelector('.account-ranking')!;
    button(panel, fixture.t('30 dias')).click();
    await settled(fixture);
    wait.resolve({ ...fixture.state.accounts, items: [] });
    await settled(fixture);
    assert.ok(panel.textContent.includes('@synthetic_author'));
  });
}
