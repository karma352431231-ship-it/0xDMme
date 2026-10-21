import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfirmedConversations } from '../src/client/messages/confirmed-conversations.ts';
import type { MessageView } from '../src/client/messages/controller.ts';
import { messageStates } from '../src/client/message-state/index.ts';

const window = (text = 'Fictícia') => ({
  snapshot: '{}',
  views: [{ text }],
  oldest: 1,
});
await test('budget removes the least-used conversation and never retains a window above the limit', () => {
  const cache = new ConfirmedConversations<{ text: string }>();
  for (let index = 0; index < 16; index++)
    cache.remember(String(index), window());
  assert.ok(cache.read('0'));
  cache.remember('16', window());
  assert.equal(cache.read('1'), null);
  assert.ok(cache.read('0'));
  cache.remember('large', window('a'.repeat(5 * 1024 * 1024)));
  assert.equal(cache.read('large'), null);
  cache.clear();
  assert.equal(cache.read('0'), null);
});
await test('text, metadata and window replacement respect the aggregate budget', () => {
  const cache = new ConfirmedConversations<{ text: string }>();
  const large = window('a'.repeat(2 * 1024 * 1024));
  cache.remember('first', large);
  cache.remember('second', large);
  assert.equal(cache.read('first'), null);
  assert.ok(cache.read('second'));
  cache.remember('second', window());
  cache.remember('third', large);
  assert.ok(cache.read('second'));
  assert.ok(cache.read('third'));
});

await test('confirmed changes invalidate only the affected conversation and advance the others', () => {
  const cache = new ConfirmedConversations<{ text: string }>(),
    from = { revision: 1 },
    next = { revision: 2 };
  const candidate = { ...window(), snapshot: JSON.stringify(from) };
  cache.remember('affected', { ...candidate });
  cache.remember('intact', { ...candidate });
  cache.remember('older', {
    ...window(),
    snapshot: JSON.stringify({ revision: 0 }),
  });
  const views = cache.read('intact')!.views;
  cache.advance(from, next, ['affected']);
  assert.equal(cache.read('affected'), null);
  assert.equal(cache.read('intact')!.views, views);
  assert.equal(cache.read('intact')!.snapshot, JSON.stringify(next));
  assert.equal(cache.read('older')!.snapshot, JSON.stringify({ revision: 0 }));
});

await test('two conversations retain their messages and profile verification metadata without holding profile photo bodies', () => {
  const cache = new ConfirmedConversations<MessageView>();
  cache.connection(true);
  const photo = Buffer.alloc(1024 * 1024, 1).toString('base64');
  const message = (id: string): MessageView => ({
    id,
    kind: 'text',
    text: 'Small verified message',
    peer: 'first',
    own: false,
    hash: 'a'.repeat(64),
    state: messageStates.received,
    sequence: 1,
    author: 'sender',
  });
  const messages = Array.from({ length: 16 }, (_, index) =>
    message(`message-${index}`),
  );
  const profiles = [false, true].map((own, index): MessageView => ({
    ...message(`profile-${index}`),
    kind: 'profile',
    own,
    text: JSON.stringify({
      name: 'Synthetic profile',
      revision: 2,
      photo: { type: 'image/png', base64: photo },
    }),
  }));
  const original = {
    snapshot: '{}',
    views: [...messages, ...profiles],
    oldest: 1,
  };
  cache.remember('first', original);
  cache.remember('second', {
    ...original,
    views: original.views.map((view) => ({ ...view, peer: 'second' })),
  });
  const restored = cache.reusable('first');
  assert.ok(
    restored,
    'Profile photo bodies must not evict the previous conversation',
  );
  assert.ok(cache.reusable('second'));
  assert.deepEqual(
    restored.views.filter((view) => view.kind !== 'profile'),
    messages,
  );
  for (const [index, profile] of profiles.entries()) {
    const retained: MessageView | undefined = restored.views.find(
      (view) => view.id === profile.id,
    );
    assert.deepEqual(retained, { ...profile, text: '' });
    assert.ok(
      original.views[16 + index]!.text.includes(photo),
      'The source profile stays available to its original owner',
    );
  }
  assert.ok(
    JSON.stringify(restored).length < 20_000,
    'The retained representation contains metadata and small messages only',
  );
});
