import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  engagementCorrection,
  engagementTarget,
} from '../src/shared/engagement-metrics/index.ts';
import { CollectionHealth } from '../src/server/engagement-metrics/collection-health.ts';
import type { CollectionFailureSummary } from '../src/server/engagement-metrics/collection-health.ts';

const traffic = {
  id: crypto.randomUUID(),
  kind: 'traffic',
  metric: 'public_page_views',
  bucket: '2026-10-26T03:00:00.000Z',
  category: 'feed',
  scope: 'project',
  delta: '-1',
  reason: 'invalid_traffic',
};

await test('operator corrections cannot alter creation totals, increase observations or lose scope consistency', () => {
  assert.equal(engagementCorrection(traffic).kind, 'traffic');
  for (const metric of ['post_views_estimated', 'reply_views_estimated'])
    assert.equal(
      engagementCorrection({
        ...traffic,
        metric,
        category: 'all',
        scope: 'post',
        entity: crypto.randomUUID(),
      }).kind,
      'traffic',
    );
  for (const patch of [
    { metric: 'accounts_created' },
    { delta: '1' },
    { delta: '-0' },
    { delta: '-9223372036854775808' },
    { category: 'post' },
    { bucket: '2026-10-26T03:00:00.001Z' },
    { account: crypto.randomUUID() },
    { reason: 'arbitrary text' },
    { metric: 'links_copied', category: 'all' },
  ])
    assert.throws(() => engagementCorrection({ ...traffic, ...patch }));
  assert.throws(() => engagementTarget('project', crypto.randomUUID()));
  assert.throws(() => engagementTarget('post', 'private'));
});

await test('visitor snapshot correction requires an explicit revision and a bounded aggregate', () => {
  const input = {
    id: crypto.randomUUID(),
    kind: 'snapshot',
    cutoff: '2026-10-26T03:00:00.000Z',
    expectedRevision: '1',
    value: '10',
    reason: 'measurement_error',
  };
  assert.deepEqual(engagementCorrection(input), input);
  for (const patch of [
    { expectedRevision: undefined },
    { value: '-1' },
    { marker: 'a'.repeat(32) },
  ])
    assert.throws(() => engagementCorrection({ ...input, ...patch }));
});

await test('collector failure reporting preserves failed flushes and concurrent failures without request data', async () => {
  const recorded: CollectionFailureSummary[] = [];
  let reject = true;
  const health = new CollectionHealth((summary) => {
    if (reject) return Promise.reject(new Error('Synthetic database outage.'));
    recorded.push(summary);
    health.failed();
    return Promise.resolve();
  });
  health.failed();
  health.failed();
  await assert.rejects(health.flush());
  health.failed();
  reject = false;
  await Promise.all([health.flush(), health.flush()]);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0]!.occurrences, 3);
  assert.deepEqual(Object.keys(recorded[0]!).sort(), [
    'from',
    'occurrences',
    'to',
  ]);
  await health.flush();
  assert.equal(recorded[1]!.occurrences, 1);
});
