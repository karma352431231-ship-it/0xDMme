import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  engagementInterval,
  engagementObservations,
  engagementVisitor,
} from '../src/shared/engagement-metrics/index.ts';
import {
  PublicObservationQueue,
  publicTrafficTarget,
  publicVisitorMarker,
} from '../src/client/public-traffic/index.ts';
import { performPublicShare } from '../src/client/communities/post-link-sharing.ts';
import { appHref } from '../src/shared/app-routes/index.ts';

const community = '11111111-1111-4111-8111-111111111111';
const post = '22222222-2222-4222-8222-222222222222';
const item = {
  id: crypto.randomUUID(),
  kind: 'page',
  category: 'post',
  community,
  post,
};

await test('public collection refuses private identifiers, arbitrary metrics and mixed visitor dimensions', () => {
  assert.deepEqual(engagementObservations({ items: [item] }), [item]);
  for (const extra of [
    { wallet: 'private' },
    { marker: 'a'.repeat(32) },
    { metric: 'accounts_created' },
    { url: '#conversas' },
  ])
    assert.throws(() =>
      engagementObservations({ items: [{ ...item, ...extra }] }),
    );
  for (const patch of [
    { kind: 'message' },
    { category: 'private' },
    { post: null },
    { community: null },
    { category: 'profile' },
  ])
    assert.throws(() =>
      engagementObservations({ items: [{ ...item, ...patch }] }),
    );
  assert.throws(() => engagementObservations({ items: [item, item] }));
  assert.throws(() => engagementObservations({ items: [] }));
  assert.throws(() =>
    engagementObservations({
      items: Array.from({ length: 25 }, () => ({
        ...item,
        id: crypto.randomUUID(),
      })),
    }),
  );
  const visitor = { id: crypto.randomUUID(), marker: 'b'.repeat(32) };
  assert.deepEqual(engagementVisitor(visitor), visitor);
  assert.throws(() => engagementVisitor({ ...visitor, post }));
  assert.throws(() => engagementVisitor({ ...visitor, account: community }));
});

await test('private routes and personalized public-content lists never enter public traffic', () => {
  for (const hash of [
    '#conversas?dm=private',
    '#perfil',
    '#status',
    '#atividade',
    '#contatos',
    '#cofre',
    '#comunidades?view=dms',
    '#comunidades?view=saved',
    '#comunidades?view=hidden',
    '#comunidades?view=following',
    '#comunidades?view=managed',
    '#comunidades?view=invitations',
  ])
    assert.equal(publicTrafficTarget(hash), null, hash);
  assert.deepEqual(
    publicTrafficTarget(`#comunidades?id=${community}&post=${post}`),
    { category: 'post', community, post },
  );
  assert.deepEqual(publicTrafficTarget('#publico?handle=public_handle'), {
    category: 'profile',
    community: null,
    post: null,
  });
  assert.equal(publicTrafficTarget('#comunidades?id=malformed'), null);
  assert.deepEqual(
    publicTrafficTarget(
      appHref('communities', new URLSearchParams({ id: community, post })),
    ),
    { category: 'post', community, post },
  );
  assert.deepEqual(publicTrafficTarget('/communities/synthetic-community'), {
    category: 'community',
    community: null,
    post: null,
  });
  assert.equal(publicTrafficTarget('/communities/dms'), null);
});

await test('visitor marker has absolute seven-day expiry, repairs corruption and tolerates disabled storage', () => {
  const data = new Map<string, string>();
  let writes = 0;
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes++;
      data.set(key, value);
    },
  };
  const time = Date.parse('2026-10-25T10:00:00Z');
  assert.equal(
    publicVisitorMarker(storage, time, () => 'a'.repeat(32)),
    'a'.repeat(32),
  );
  assert.equal(
    publicVisitorMarker(storage, time + 6 * 86_400_000, () => 'b'.repeat(32)),
    'a'.repeat(32),
  );
  assert.equal(writes, 1);
  assert.equal(
    publicVisitorMarker(storage, time + 7 * 86_400_000, () => 'c'.repeat(32)),
    'c'.repeat(32),
  );
  storage.setItem('0xdmme:public-visitor:v1', '{broken');
  assert.equal(
    publicVisitorMarker(storage, time, () => 'd'.repeat(32)),
    'd'.repeat(32),
  );
  assert.equal(
    publicVisitorMarker(
      {
        getItem: () => {
          throw new Error('disabled');
        },
        setItem: () => {},
      },
      time,
    ),
    null,
  );
});

await test('calendar reports use the chosen timezone and DST-aware midnight boundaries', () => {
  const base = {
    startedAt: '2026-01-01T00:00:00.000Z',
    timezone: 'America/Fortaleza',
    cutoff: '2026-10-25T02:00:00.000Z',
  };
  assert.deepEqual(engagementInterval({ ...base, preset: 'day' }), {
    from: '2026-10-24T03:00:00.000Z',
    to: base.cutoff,
  });
  assert.deepEqual(engagementInterval({ ...base, preset: 'week' }), {
    from: '2026-10-19T03:00:00.000Z',
    to: base.cutoff,
  });
  const dst = engagementInterval({
    ...base,
    timezone: 'America/New_York',
    cutoff: '2026-03-09T12:00:00.000Z',
    preset: 'yesterday',
  });
  assert.equal(Date.parse(dst.to) - Date.parse(dst.from), 23 * 3_600_000);
  const fallback = engagementInterval({
    ...base,
    timezone: 'America/New_York',
    cutoff: '2026-11-02T12:00:00.000Z',
    preset: 'yesterday',
  });
  assert.equal(
    Date.parse(fallback.to) - Date.parse(fallback.from),
    25 * 3_600_000,
  );
});

await test('queued traffic separates visitor transport from page dimensions and cancels disposal', async () => {
  const sent: { url: string; body: unknown }[] = [];
  const queue = new PublicObservationQueue((url, init) => {
    assert.ok(typeof url === 'string');
    const body = init?.body;
    assert.ok(typeof body === 'string');
    sent.push({
      url,
      body: JSON.parse(body) as unknown,
    });
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  queue.observe({ ...item, kind: 'page', category: 'post' });
  queue.visitor('a'.repeat(32));
  await delay(200);
  queue.close();
  assert.equal(sent.length, 2);
  assert.equal(sent[0]!.url, '/api/engagement/observations');
  assert.equal(JSON.stringify(sent[0]!.body).includes('marker'), false);
  assert.equal(sent[1]!.url, '/api/engagement/visitors');
  assert.equal(JSON.stringify(sent[1]!.body).includes(community), false);
  const before = sent.length;
  queue.observe({ ...item, kind: 'page', category: 'post' });
  await delay(150);
  assert.equal(sent.length, before);
});

await test('share cancellation and failed clipboard writes never become copied links or delivery claims', async () => {
  const seen: string[] = [];
  const success = {
    share: () => Promise.resolve(),
    copy: () => Promise.resolve(),
  };
  assert.equal(
    await performPublicShare(
      { kind: 'copy', url: 'https://example.invalid/' },
      success,
      (kind) => seen.push(kind),
    ),
    'copied',
  );
  assert.deepEqual(seen, ['share', 'copy']);
  seen.length = 0;
  await assert.rejects(
    performPublicShare(
      { kind: 'copy', url: 'https://example.invalid/' },
      {
        ...success,
        copy: () => Promise.reject(new Error('Denied clipboard access.')),
      },
      (kind) => seen.push(kind),
    ),
  );
  assert.deepEqual(seen, ['share']);
  seen.length = 0;
  await assert.rejects(
    performPublicShare(
      { kind: 'share', url: 'https://example.invalid/' },
      {
        ...success,
        share: () =>
          Promise.reject(new DOMException('Canceled.', 'AbortError')),
      },
      (kind) => seen.push(kind),
    ),
  );
  assert.deepEqual(seen, ['share']);
});
