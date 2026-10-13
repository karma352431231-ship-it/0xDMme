import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mentionNotificationPage,
  mentionNotificationHref,
} from '../src/shared/mention-notifications/index.ts';
const actor = { id: crypto.randomUUID(), handle: 'ana', avatar: null };
const item = {
  id: crypto.randomUUID(),
  actor,
  source: {
    kind: 'post',
    id: crypto.randomUUID(),
    community: crypto.randomUUID(),
    name: null,
  },
  text: 'Oi!',
  createdAt: '2026-10-12T12:00:00.000Z',
  read: false,
};
await test('menções validam contexto público e destinos próprios sem campos privados', () => {
  assert.equal(
    mentionNotificationPage({ items: [{ ...item, text: '👨‍👩‍👧‍👦' }], next: null })
      .items[0]?.text,
    '👨‍👩‍👧‍👦',
  );
  const result = mentionNotificationPage({ items: [item], next: null });
  assert.deepEqual(result.items, [item]);
  assert.equal(
    mentionNotificationHref(result.items[0]!),
    `#comunidades?id=${item.source.community}&post=${item.source.id}`,
  );
  for (const kind of ['profile', 'community'] as const) {
    const note = { ...item, source: { ...item.source, kind, community: null } };
    assert.equal(
      mentionNotificationHref(
        mentionNotificationPage({ items: [note], next: null }).items[0]!,
      ),
      kind === 'profile'
        ? `#publico?id=${item.source.id}`
        : `#comunidades?id=${item.source.id}`,
    );
  }
  for (const invalid of [
    { ...item, actor: { ...actor, wallet: 'private' } },
    { ...item, text: 'x'.repeat(281) },
    { ...item, read: 'true' },
    { ...item, source: { ...item.source, community: null } },
    { ...item, source: { ...item.source, kind: 'dm' } },
  ])
    assert.throws(() =>
      mentionNotificationPage({ items: [invalid], next: null }),
    );
  assert.throws(() =>
    mentionNotificationPage({
      items: Array.from({ length: 25 }, () => item),
      next: null,
    }),
  );
});
