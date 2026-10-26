import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  engagementMetrics,
  engagementQuery,
  isEngagementMetric,
} from '../src/shared/engagement-metrics/index.ts';

const community = '11111111-1111-4111-8111-111111111111';
const post = '22222222-2222-4222-8222-222222222222';

function input(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    metrics: ['posts_created'],
    from: '2026-10-25T00:00:00.000Z',
    to: '2026-10-26T00:00:00.000Z',
    timezone: 'America/Fortaleza',
    groupBy: 'none',
    eligibility: 'historical',
    orderBy: { by: 'dimension', direction: 'asc' },
    limit: 100,
    ...overrides,
  };
}

await test('metric selections remain independent with one explicit common interval', () => {
  const metrics = [
    'accounts_created',
    'public_profiles_created',
    'replies_created',
  ];
  const query = engagementQuery(input({ metrics }));
  assert.deepEqual(query.metrics, metrics);
  assert.equal(query.from, '2026-10-25T00:00:00.000Z');
  assert.equal(query.to, '2026-10-26T00:00:00.000Z');
  assert.deepEqual(query.communityIds, []);
  assert.deepEqual(query.postIds, []);
  assert.equal(query.bucket, null);
  assert.equal(query.cursor, null);
});

await test('estimated visitors, current positions and additive counts keep distinct semantics', () => {
  assert.equal(
    engagementMetrics.public_site_visitors_estimated.aggregation,
    'distinct',
  );
  assert.equal(engagementMetrics.public_page_views.aggregation, 'additive');
  assert.equal(
    engagementMetrics.public_contributors_distinct.aggregation,
    'distinct',
  );
  assert.equal(engagementMetrics.upvotes_current.aggregation, 'current');
  assert.equal(engagementMetrics.upvotes_added.aggregation, 'additive');
  assert.equal(isEngagementMetric('toString'), false);
  assert.equal(isEngagementMetric('__proto__'), false);
});

await test('metric selection rejects unknown, duplicate, empty and excessive inputs', () => {
  for (const metrics of [
    [],
    ['users_total'],
    ['posts_created', 'posts_created'],
    ['accounts_created', '__proto__'],
    Array.from({ length: 23 }, () => 'posts_created'),
    'posts_created',
  ])
    assert.throws(() => engagementQuery(input({ metrics })));
  assert.throws(() => engagementQuery(input({ account: community })));
});

await test('every selected metric must support every entity filter and grouping', () => {
  const selected = {
    metrics: ['post_views_estimated', 'reply_views_estimated'],
    communityIds: [community],
    postIds: [post],
    groupBy: 'post',
  };
  assert.deepEqual(engagementQuery(input(selected)).postIds, [post]);
  for (const overrides of [
    { metrics: ['accounts_created'], communityIds: [community] },
    { metrics: ['posts_created'], postIds: [post] },
    { metrics: ['public_site_visitors_estimated'], groupBy: 'community' },
    {
      metrics: ['posts_created', 'accounts_created'],
      communityIds: [community],
    },
    { metrics: ['public_contributors_distinct'], groupBy: 'post' },
    { metrics: ['accounts_existing'], eligibility: 'promotable' },
  ])
    assert.throws(() => engagementQuery(input(overrides)));
});

await test('time grouping never manufactures historical inventory or vote snapshots', () => {
  for (const metric of [
    'accounts_existing',
    'public_profiles_existing',
    'upvotes_current',
    'downvotes_current',
  ])
    assert.throws(() =>
      engagementQuery(
        input({ metrics: [metric], groupBy: 'time', bucket: 'day' }),
      ),
    );
  const query = engagementQuery(input({ groupBy: 'time', bucket: 'day' }));
  assert.equal(query.bucket, 'day');
  assert.throws(() => engagementQuery(input({ bucket: 'day' })));
  assert.throws(() => engagementQuery(input({ groupBy: 'time' })));
});

await test('intervals and timezone are explicit and reject invalid calendar dates', () => {
  for (const overrides of [
    { from: undefined },
    { timezone: undefined },
    { timezone: 'Mars/Olympus' },
    { from: '2026-02-30T00:00:00.000Z' },
    { from: '2026-10-26T00:00:00.000Z' },
    { from: '2026-10-27T00:00:00.000Z' },
    { from: '2026-10-25' },
    { from: Number.NaN },
    { to: 'invalid' },
  ])
    assert.throws(() => engagementQuery(input(overrides)));
  assert.equal(engagementQuery(input({ timezone: 'UTC' })).timezone, 'UTC');
});

await test('entity filters are bounded and cannot silently become a project-wide query', () => {
  for (const ids of [
    [],
    [community, community],
    ['not-an-id'],
    Array.from({ length: 101 }, () => community),
  ])
    assert.throws(() => engagementQuery(input({ communityIds: ids })));
  assert.throws(() =>
    engagementQuery(
      input({
        postIds: [community, community],
        metrics: ['post_views_estimated'],
      }),
    ),
  );
});

await test('ordering only accepts selected metrics and bounded pagination', () => {
  const query = engagementQuery(
    input({
      groupBy: 'community',
      orderBy: { by: 'posts_created', direction: 'desc' },
      limit: 5,
      cursor: 'opaque_cursor-1',
    }),
  );
  assert.equal(query.limit, 5);
  assert.equal(query.cursor, 'opaque_cursor-1');
  for (const overrides of [
    { limit: 0 },
    { limit: 1001 },
    { limit: 1.5 },
    { limit: '5' },
    { cursor: '' },
    { cursor: 'x'.repeat(4097) },
    { cursor: 'query; DROP TABLE' },
    { orderBy: { by: 'accounts_created', direction: 'desc' } },
    { orderBy: { by: 'dimension', direction: 'sideways' } },
    { orderBy: { by: 'dimension', direction: 'asc', sql: 'untrusted' } },
  ])
    assert.throws(() => engagementQuery(input(overrides)));
});
