import { communityDocument, CommunityNode } from './fixtures/community-dom.ts';
import {
  classificationForm,
  classificationBadges,
} from '../src/client/communities/classification.ts';
import {
  currentLanguage,
  setActiveLanguage,
} from '../src/shared/i18n/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import {
  communityClassification,
  communityTopicSelection,
} from '../src/shared/community-classification/index.ts';
import {
  discoveryKey,
  exploreCursor,
  exploreFilter,
} from '../src/shared/community-discovery/index.ts';
import { publicModerationNotice } from '../src/shared/public-moderation/index.ts';

await test('community topics: up to two unique known topics, canonical order and independent NSFW', () => {
  assert.deepEqual(
    communityClassification({ nsfw: false, topics: ['meme', 'ai'] }),
    { nsfw: false, topics: ['ai', 'meme'] },
  );
  assert.deepEqual(communityClassification(undefined), {
    nsfw: false,
    topics: [],
  });
  for (const topics of [
    ['ai', 'ai'],
    ['unknown'],
    ['ai', 'cat', 'dog'],
    [null],
    'ai',
  ])
    assert.throws(
      () => communityClassification({ nsfw: true, topics }),
      AccountError,
    );
  assert.throws(
    () => communityClassification({ nsfw: 'true', topics: [] }),
    AccountError,
  );
  assert.throws(
    () =>
      communityClassification({ nsfw: false, topics: [], owner: 'injected' }),
    AccountError,
  );
});
await test('ranking topics: multi-select, canonical cursors and rejection of cross-filter pagination', () => {
  const filter = exploreFilter({
    order: 'size',
    period: 'day',
    topics: ['meme', 'ai', 'cat'],
  });
  assert.deepEqual(filter.topics, ['ai', 'cat', 'meme']);
  assert.equal(
    discoveryKey(filter),
    discoveryKey(
      exploreFilter({
        order: 'size',
        period: 'day',
        topics: ['cat', 'meme', 'ai'],
      }),
    ),
  );
  const cursor = JSON.stringify({
    generation: crypto.randomUUID(),
    rank: 1,
    id: crypto.randomUUID(),
    filter: discoveryKey(filter),
  });
  assert.ok(exploreCursor(cursor, discoveryKey(filter)));
  assert.throws(
    () =>
      exploreCursor(
        cursor,
        discoveryKey(
          exploreFilter({ order: 'size', period: 'day', topics: ['dog'] }),
        ),
      ),
    AccountError,
  );
  assert.deepEqual(
    exploreFilter({ order: 'size', period: 'day', topics: [] }),
    { order: 'size', period: 'day' },
  );
  assert.throws(() => communityTopicSelection(['ai', 'ai'], 11), AccountError);
});
await test('unreviewed publication flag validates the transport without inventing model evidence', () => {
  const notice = {
    id: crypto.randomUUID(),
    kind: 'post-media',
    target: crypto.randomUUID(),
    status: 'approved',
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    appeal: null,
    decision: null,
    unreviewed: true,
  };
  assert.equal(publicModerationNotice(notice).unreviewed, true);
  assert.throws(
    () => publicModerationNotice({ ...notice, unreviewed: 'yes' }),
    AccountError,
  );
});

await test('topic choices enforce the two-topic creation limit and support both official languages', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document'),
    language = currentLanguage();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: communityDocument(),
  });
  try {
    for (const locale of ['en', 'zh-CN'] as const) {
      setActiveLanguage(locale);
      const host = new CommunityNode('div');
      const read = classificationForm(host as unknown as HTMLElement);
      const disclosure = host.querySelector('details');
      assert.ok(disclosure);
      assert.equal(disclosure.getAttribute('open'), null);
      const summary = disclosure.querySelector('summary');
      assert.ok(summary);
      assert.match(summary.textContent, /0\/2/u);
      const inputs = host.querySelectorAll('input');
      const choose = (index: number, checked: boolean) => {
        inputs[index]!.checked = checked;
        inputs[index]!.dispatchEvent(new Event('change'));
      };
      choose(0, true);
      choose(1, true);
      choose(2, true);
      assert.deepEqual(read(), { nsfw: true, topics: ['ai', 'cat'] });
      assert.match(summary.textContent, /2\/2/u);
      assert.equal(inputs[3]!.disabled, true);
      choose(2, false);
      assert.equal(inputs[3]!.disabled, false);
      choose(3, true);
      assert.deepEqual(read().topics, ['ai', 'dog']);
      const badges = classificationBadges(read());
      assert.match(badges.textContent ?? '', /NSFW/u);
      assert.doesNotMatch(badges.textContent ?? '', /Meme|表情包|TikTok/u);
      assert.match(
        host.textContent,
        locale === 'en'
          ? /cannot be changed after creation/u
          : /创建后无法更改/u,
      );
    }
  } finally {
    setActiveLanguage(language);
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
