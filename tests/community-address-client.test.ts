import { ApiResponseError } from '../src/client/api-response/index.ts';
import { communitySelection } from '../src/client/communities/navigation.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCommunityDetail } from '../src/client/communities/detail-refresh.ts';

await test('a UUID-shaped community address resolves by name rather than another community ID', async (t) => {
  const slug = crypto.randomUUID(),
    actual = crypto.randomUUID();
  const requests: string[] = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { hash: '', pathname: '/communities/' + slug, search: '' },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else Reflect.deleteProperty(globalThis, 'location');
  });
  t.mock.method(globalThis, 'fetch', (input: string | URL | Request) => {
    requests.push(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    return Promise.resolve(
      Response.json({
        id: actual,
        slug,
        name: slug,
        description: '',
        rules: '',
        revision: 1,
        archived: false,
        avatar: null,
        owner: null,
        followers: 0,
      }),
    );
  });
  const selection = communitySelection(new URLSearchParams({ slug }));
  assert.ok(selection.selected);
  const result = await readCommunityDetail({
    id: selection.selected,
    slug: selection.slug,
    signedIn: false,
    signal: new AbortController().signal,
    valid: () => true,
    state: () => {
      throw new Error('Anonymous read must remain public');
    },
    previous: { community: null, state: null },
  });
  assert.deepEqual(requests, ['/api/communities/address/' + slug]);
  assert.equal(result?.community.id, actual);
});

await test('only a missing public profile retains the read-only community; revocation and session failures still reject', async (t) => {
  const id = crypto.randomUUID();
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(
      Response.json({
        id,
        name: 'Synthetic public community',
        description: '',
        rules: '',
        revision: 1,
        archived: false,
        avatar: null,
        owner: null,
        followers: 0,
      }),
    ),
  );
  const read = (error: Error) =>
    readCommunityDetail({
      id,
      signedIn: true,
      signal: new AbortController().signal,
      valid: () => true,
      state: () => Promise.reject(error),
      previous: { community: null, state: null },
    });
  const missing = new ApiResponseError({
    operation: 'communities/state',
    status: 403,
    failure: 'http',
    message: 'Create your public profile in Profile before participating.',
  });
  const result = await read(missing);
  assert.equal(result?.community.id, id);
  assert.equal(result?.state, null);
  for (const status of [401, 403, 409]) {
    const denied = new ApiResponseError({
      operation: 'communities/state',
      status,
      failure: 'http',
      message: 'Device no longer authorized.',
    });
    await assert.rejects(read(denied), (error) => error === denied);
  }
});
