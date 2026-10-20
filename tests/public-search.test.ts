import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  publicSearchQuery,
  PublicSearchRequests,
} from '../src/client/public-search/query.ts';
import { searchMentions } from '../src/client/public-mentions/index.ts';
await test('public search accepts handles and normalized names and rejects invalid terms', () => {
  assert.equal(publicSearchQuery(' @Ana '), 'ana');
  assert.equal(
    publicSearchQuery(' IDEIAS   &   Conversas '),
    'ideias & conversas',
  );
  assert.equal(publicSearchQuery('@a'), '');
  assert.throws(() => publicSearchQuery('a'.repeat(101)));
  assert.throws(() => publicSearchQuery('an\u0000'));
});
await test('search change or dismissal discards late responses and keeps current failures visible', async () => {
  const pending = new Map<string, (result: string[]) => void>();
  const source = new PublicSearchRequests<string[]>(
    (query) => new Promise((resolve) => pending.set(query, resolve)),
  );
  const first = source.search('ana'),
    second = source.search('arte');
  pending.get('ana')!(['resultado antigo']);
  assert.equal(await first, null);
  pending.get('arte')!(['resultado atual']);
  assert.deepEqual(await second, ['resultado atual']);
  const closed = source.search('chat');
  source.close();
  pending.get('chat')!(['resultado fechado']);
  assert.equal(await closed, null);
  await assert.rejects(
    new PublicSearchRequests(() =>
      Promise.reject(new Error('HTTP indisponível')),
    ).search('ana'),
    /HTTP indisponível/u,
  );
});
await test('search queries only public endpoints without cookies and respects the result limit', async (t) => {
  const requests: {
    path: string;
    credentials: RequestCredentials | undefined;
  }[] = [];
  t.mock.method(globalThis, 'fetch', (url: string, init: RequestInit) => {
    requests.push({ path: url, credentials: init.credentials });
    if (url.includes('public-profiles'))
      return Promise.resolve(
        Response.json([
          { id: crypto.randomUUID(), handle: 'anacosta', avatar: null },
        ]),
      );
    return Promise.resolve(
      Response.json({
        items: [
          {
            id: crypto.randomUUID(),
            name: 'Ana & amigos',
            description: '',
            rules: '',
            revision: 1,
            archived: false,
            avatar: null,
            owner: null,
            followers: 0,
          },
        ],
        next: null,
      }),
    );
  });
  const results = await searchMentions('ana', new AbortController().signal);
  assert.deepEqual(
    results.map((result) => result.kind),
    ['user', 'community'],
  );
  assert.deepEqual(
    requests.map((request) => request.path),
    [
      '/api/public-profiles/_/suggestions?q=ana',
      '/api/communities/suggestions?q=ana',
    ],
  );
  assert.ok(requests.every((request) => request.credentials === 'omit'));
  t.mock.method(globalThis, 'fetch', (url: string) =>
    Promise.resolve(
      Response.json(
        url.includes('public-profiles')
          ? Array(9).fill({})
          : { items: [], next: null },
      ),
    ),
  );
  await assert.rejects(
    searchMentions('ana', new AbortController().signal),
    /[Ii]nvalid/u,
  );
});
