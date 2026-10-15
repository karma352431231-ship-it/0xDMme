import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FeedReturn,
  feedPosition,
  restoreFeedPosition,
} from '../src/client/communities/feed-return.ts';
import type { FeedBookmark } from '../src/client/communities/feed-return.ts';

const bookmark: FeedBookmark = {
  view: 'following',
  order: 'votes',
  period: 'week',
  after: 'cursor-da-pagina',
  top: 1234,
  anchor: { id: 'post-de-origem', offset: -15 },
};
await test('abrir post conserva página, filtros e posição; retorno é consumido uma vez', () => {
  const navigation = new FeedReturn();
  navigation.capture(bookmark);
  assert.equal(
    navigation.take(new URLSearchParams('id=comunidade&post=post')),
    null,
  );
  assert.equal(navigation.target(), '#communities?view=following&return=feed');
  assert.deepEqual(
    navigation.take(new URLSearchParams('view=following')),
    bookmark,
  );
  assert.equal(navigation.take(new URLSearchParams('view=following')), null);
});
await test('selecionar outro feed, navegar explicitamente ou recarregar descarta o retorno', () => {
  const navigation = new FeedReturn();
  navigation.capture(bookmark);
  assert.equal(navigation.take(new URLSearchParams('view=feed')), null);
  navigation.capture(bookmark);
  navigation.clear();
  assert.equal(navigation.take(new URLSearchParams('view=following')), null);
  assert.equal(new FeedReturn().target(), null);
});

await test('retorno por rolagem da página ancora o primeiro post visível, inclusive após mudança de altura', (t) => {
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );
  const previousStyle = Object.getOwnPropertyDescriptor(
    globalThis,
    'getComputedStyle',
  );
  const scroll = {
    scrollTop: 600,
    getBoundingClientRect: () => ({ top: -scroll.scrollTop }),
  };
  let growth = 0;
  const row = (id: string, y: () => number) => ({
    dataset: { postId: id },
    getBoundingClientRect: () => ({
      top: y() - scroll.scrollTop,
      bottom: y() - scroll.scrollTop + 200,
    }),
  });
  const container = {
    parentElement: null,
    querySelectorAll: () => [
      row('acima', () => 0),
      row('visivel', () => 600 + growth),
    ],
  } as unknown as HTMLElement;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { scrollingElement: scroll },
  });
  Object.defineProperty(globalThis, 'getComputedStyle', {
    configurable: true,
    value: () => ({ overflowY: 'visible' }),
  });
  t.after(() => {
    if (previousDocument)
      Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (previousStyle)
      Object.defineProperty(globalThis, 'getComputedStyle', previousStyle);
    else Reflect.deleteProperty(globalThis, 'getComputedStyle');
  });
  const saved = { ...bookmark, ...feedPosition(container) };
  assert.deepEqual(saved.anchor, { id: 'visivel', offset: 0 });
  growth = 80;
  scroll.scrollTop = 0;
  restoreFeedPosition(container, saved);
  assert.equal(scroll.scrollTop, 680);
});
