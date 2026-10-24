import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testDatabaseUrl } from './e2e/fixtures/database.ts';
import { percentile } from './e2e/chat-metrics.ts';
import { chatSummary } from './e2e/chat-report.ts';
import { senderPhaseTimings } from './e2e/chat-phase-timings.ts';
import { fixtureReady } from './e2e/fixtures/environment.ts';
import { createServer } from 'node:http';

await test('browser harness refuses non-test, remote and ambiguous database targets', () => {
  for (const value of [
    undefined,
    'postgresql://test@127.0.0.1/hash_talk_stage',
    'postgresql://test@db.example/hash_talk_test',
    'postgresql://test@127.0.0.1/hash_talk_test?options=anything',
    'postgresql://test@127.0.0.1/hash_talk_test#fragment',
  ])
    assert.throws(() => testDatabaseUrl(value));
  assert.equal(
    testDatabaseUrl('postgresql://synthetic@127.0.0.1/hash_talk_test').pathname,
    '/hash_talk_test',
  );
});
await test('latency summary uses nearest-rank tails without hiding a known delay', () => {
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([10, 10, 10, 10, 500], 0.95), 500);
  assert.equal(percentile([40, 10, 30, 20], 0.5), 20);
});

await test('shared summaries keep browser versions separate and omit raw observation data', async () => {
  const metrics = {
    latency: [
      {
        label: 'a-to-b',
        samples: [500],
        automaticSamples: [500],
        reviewedSamples: [],
        count: 1,
        missing: 0,
      },
    ],
    dropped: 0,
    errors: [],
    interruptedResponses: 0,
    complete: true,
    operations: {},
    clocks: [],
    drains: [],
    detailed: false,
    observations: [{ event: 'synthetic-private-detail' }],
  };
  const attachment = (name: string, value: unknown) => ({
    name,
    body: Buffer.from(JSON.stringify(value)).toString('base64'),
  });
  const tests = ['100.0', '101.0'].map((version) => ({
    projectName: 'chromium',
    results: [
      {
        status: 'passed',
        duration: 1000,
        attachments: [
          attachment('browser-version', { name: 'chromium', version }),
          attachment('chat-metrics', metrics),
        ],
      },
    ],
  }));
  const report = await chatSummary(
    JSON.stringify({
      suites: [{ title: 'delivery', specs: [{ title: 'burst', tests }] }],
      stats: { expected: 2, unexpected: 0 },
    }),
  );
  assert.equal(report.pooled.length, 2);
  assert.deepEqual(
    report.pooled.map((value) => value.count),
    [1, 1],
  );
  assert.doesNotMatch(JSON.stringify(report), /synthetic-private-detail/);
});

await test('readiness rejects a healthy listener that does not prove this run ownership', async (t) => {
  const owner = 'a'.repeat(48);
  let proof = false;
  const server = createServer((request, response) => {
    if (request.url === '/health/ready') return response.end('ready');
    if (proof && request.url === `/fixture-owner-${owner}.txt`)
      return response.end(owner);
    response.writeHead(404).end('another listener');
  });
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  assert.equal(await fixtureReady(origin, owner), false);
  proof = true;
  assert.equal(await fixtureReady(origin, 'b'.repeat(48)), false);
  assert.equal(await fixtureReady(origin, owner), true);
});

await test('stage timings keep opaque message slots within their page and capture', () => {
  const event = (page: number, at: number, detail: object) => ({
    page,
    at,
    event: {
      event: 'diagnostic',
      detail: { version: 1, source: 1, conversation: 0, ...detail },
    },
  });
  const report = senderPhaseTimings([
    event(1, 10, { event: 'direct-send', reason: 'admitted', message: 1 }),
    event(2, 11, { event: 'direct-send', reason: 'accepted', message: 1 }),
    event(1, 15, { event: 'direct-send', reason: 'staged', message: 1 }),
    event(1, 30, { event: 'direct-send', reason: 'accepted', message: 1 }),
    event(1, 40, { event: 'ready', reason: 'capture-started' }),
    event(1, 50, { event: 'direct-send', reason: 'accepted', message: 1 }),
  ]);
  const first = report.cohorts.find((cohort) => cohort.page === 1)!;
  assert.equal(first.slots, 2);
  assert.equal(first.incompleteSlots, 1);
  assert.deepEqual(first.admissionToStagedMs, [5]);
  assert.deepEqual(first.stagedToAcceptedMs, [15]);
  assert.equal(
    report.cohorts.find((cohort) => cohort.page === 2)?.incompleteSlots,
    1,
  );
});
