import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchMentions } from '../src/client/public-mentions/search.ts';
import { accountRankingPage } from '../src/shared/account-ranking/index.ts';

// Opt-in smoke against an already running synthetic fixture. No database reset,
// account creation or signed writes: the review's sessions and history survive.
const configuredOrigin = process.env['HASH_TALK_FIXTURE_DISCOVERY_ORIGIN'];
function fixtureOrigin(value: string): string {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.match(url.port, /^4511[1-9]$/u);
  assert.equal(url.href, url.origin + '/');
  return url.origin;
}
await test(
  'browser fixture serves combined handle discovery, Users rankings and publication hints',
  { skip: !configuredOrigin },
  async (t) => {
    const origin = fixtureOrigin(configuredOrigin!);
    const request = (path: string) =>
      fetch(origin + path, {
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
    await t.test(
      'the real client combines profile and community suggestions',
      async (t) => {
        const fetchFromFixture = globalThis.fetch;
        t.mock.method(
          globalThis,
          'fetch',
          (input: string, init?: RequestInit) =>
            fetchFromFixture(new URL(input, origin), init),
        );
        const query =
          process.env['HASH_TALK_FIXTURE_DISCOVERY_QUERY'] ?? 'retest';
        const choices = await searchMentions(query, AbortSignal.timeout(8000));
        assert.ok(choices.length <= 16);
        assert.ok(choices.every((choice) => choice.id && choice.label));
      },
    );
    await t.test(
      'Users accepts default Trending, explicit Trending and Biggest',
      async () => {
        for (const query of [
          '',
          '?order=trending',
          '?order=size&period=week',
        ]) {
          const response = await request('/api/communities/accounts' + query);
          assert.equal(response.status, 200);
          accountRankingPage(await response.json());
        }
        const restricted = await request(
          '/api/communities/accounts?order=following',
        );
        assert.equal(restricted.status, 403);
        await restricted.body?.cancel();
      },
    );
    await t.test(
      'rankings can subscribe to public publication hints',
      async () => {
        const controller = new AbortController();
        try {
          const response = await fetch(
            origin + '/api/communities/ranking-events',
            {
              credentials: 'omit',
              redirect: 'error',
              cache: 'no-store',
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(8000),
              ]),
            },
          );
          assert.equal(response.status, 200);
          assert.equal(
            response.headers.get('content-type'),
            'text/event-stream; charset=utf-8',
          );
          const reader = response.body!.getReader();
          try {
            const frame = await reader.read();
            assert.match(
              new TextDecoder().decode(frame.value),
              /event: ready\ndata: \{\}\n\n/u,
            );
          } finally {
            await reader.cancel();
            reader.releaseLock();
          }
        } finally {
          controller.abort();
        }
      },
    );
  },
);
