import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import type { CommunityPost } from '../src/shared/community-posts/index.ts';
import { postReadLookup } from '../src/server/communities/post-reads.ts';
import type { CommunityPostReads } from '../src/server/communities/post-reads.ts';

function fixture() {
  const community = crypto.randomUUID(),
    post = crypto.randomUUID(),
    tag = crypto.randomUUID();
  const value: CommunityPost = {
    id: post,
    community,
    author: null,
    title: 'Synthetic post',
    text: 'Synthetic public text',
    tags: [],
    createdAt: '2026-10-24T12:00:00.000Z',
    editedAt: null,
    revision: 1,
    status: 'visible',
    parent: null,
    root: null,
    score: 0,
    replies: 0,
  };
  const calls: { operation: string; args: unknown[] }[] = [];
  const page = { items: [value], next: null };
  const tags = {
    items: [{ id: tag, label: 'General', active: true, revision: 1 }],
    next: null,
  };
  function called<T>(
    operation: string,
    args: unknown[],
    result: T,
  ): Promise<T> {
    calls.push({ operation, args });
    return Promise.resolve(result);
  }
  const reads: CommunityPostReads = {
    post: (...args) => called('post', args, value),
    postPage: (...args) => called('postPage', args, page),
    replies: (...args) => called('replies', args, page),
    discussion: (...args) =>
      called('discussion', args, { ...page, previews: [] }),
    tags: (...args) => called('tags', args, tags),
  };
  const base = `/api/communities/${community}`;
  return { community, post, tag, value, calls, page, tags, reads, base };
}
function address(path: string): URL {
  return new URL(path, 'http://local.invalid');
}
function status(code: number) {
  return (error: unknown) =>
    error instanceof AccountError && error.status === code;
}

await test('public post reads preserve post, page, tag and legacy reply projections and cursors', async () => {
  const f = fixture(),
    cursor = `${f.value.createdAt}/${f.post}`;
  const cases = [
    {
      path: `${f.base}/posts/${f.post}`,
      result: f.value,
      operation: 'post',
      args: [f.community, f.post],
    },
    {
      path: `${f.base}/posts?tag=${f.tag}&after=${encodeURIComponent(cursor)}`,
      result: f.page,
      operation: 'postPage',
      args: [f.community, cursor, f.tag],
    },
    {
      path: `${f.base}/posts/${f.post}/replies?after=${encodeURIComponent(cursor)}`,
      result: f.page,
      operation: 'replies',
      args: [f.community, f.post, cursor],
    },
    {
      path: `${f.base}/tags?after=${f.tag}`,
      result: f.tags,
      operation: 'tags',
      args: [f.community, f.tag],
    },
  ];
  for (const current of cases) {
    assert.deepEqual(
      await postReadLookup(address(current.path), f.reads),
      current.result,
    );
    assert.deepEqual(f.calls.at(-1), {
      operation: current.operation,
      args: current.args,
    });
  }
});

await test('ordered discussion keeps the opt-in preview and its selection separate from legacy replies', async () => {
  const f = fixture(),
    cursor = 'opaque-discussion-cursor';
  const result = await postReadLookup(
    address(
      `${f.base}/posts/${f.post}/replies?order=votes&preview=top&after=${cursor}`,
    ),
    f.reads,
  );
  assert.deepEqual(result, { ...f.page, previews: [] });
  assert.deepEqual(f.calls, [
    {
      operation: 'discussion',
      args: [
        f.community,
        f.post,
        { order: 'votes', preview: 'top', after: cursor },
      ],
    },
  ]);
  const legacy = { ...f.reads, discussion: undefined };
  await assert.rejects(
    postReadLookup(
      address(`${f.base}/posts/${f.post}/replies?order=votes`),
      legacy,
    ),
    status(400),
  );
  assert.equal(f.calls.length, 1);
});

await test('malformed routes, unsupported reads and invalid filters fail before invoking a provider', async () => {
  const f = fixture();
  for (const path of [
    `${f.base}/posts?extra=1`,
    `${f.base}/posts?tag=${f.tag}&tag=${f.tag}`,
    `${f.base}/tags?after=${f.tag}&after=${f.tag}`,
    `${f.base}/posts/${f.post}/replies?extra=1`,
    `${f.base}/posts/${f.post}/replies?order=votes&order=recent`,
    `${f.base}/posts/${f.post}/replies?order=votes&preview=top&private=1`,
    `${f.base}/posts/not-an-id`,
  ])
    await assert.rejects(postReadLookup(address(path), f.reads), status(400));
  for (const path of [
    `${f.base}/posts/${f.post}?extra=1`,
    `${f.base}/posts/${f.post}/other`,
  ])
    await assert.rejects(postReadLookup(address(path), f.reads), status(404));
  for (const suffix of [
    '/posts',
    `/posts/${f.post}`,
    `/posts/${f.post}/replies`,
    '/tags',
  ])
    await assert.rejects(
      postReadLookup(address(f.base + suffix), {}),
      status(404),
    );
  assert.deepEqual(f.calls, []);
});

await test('post output validation and provider authorization failures remain authoritative', async () => {
  const f = fixture(),
    url = address(`${f.base}/posts/${f.post}`);
  await assert.rejects(
    postReadLookup(url, {
      post: () =>
        Promise.resolve({ ...f.value, wallet: 'synthetic-private-field' }),
    }),
    status(400),
  );
  const denied = new AccountError(403, 'Request has no current authorization.');
  await assert.rejects(
    postReadLookup(url, { post: () => Promise.reject(denied) }),
    (error) => error === denied,
  );
});
