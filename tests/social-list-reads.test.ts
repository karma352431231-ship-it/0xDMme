import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SocialListReads } from '../src/client/social-dm/list-reads.ts';
import { deferred } from './fixtures/deferred.ts';

await test('equivalent in-flight handle list reads share; cursor and priority differences keep their own turns', async () => {
  const reads = new SocialListReads(),
    page = { items: [], next: null };
  const gate = deferred<typeof page>();
  const shared: boolean[] = [];
  let calls = 0;
  const load = () => {
    calls++;
    return gate.promise;
  };
  const input = {
    after: null,
    options: {},
    load,
    observed: (value: boolean) => shared.push(value),
  };
  const first = reads.read(input),
    second = reads.read(input);
  const cursor = reads.read({ ...input, after: crypto.randomUUID() });
  const interactive = reads.read({
    ...input,
    options: { priority: 'interactive' },
  });
  assert.equal(first, second);
  assert.notEqual(first, cursor);
  assert.notEqual(first, interactive);
  assert.deepEqual(shared, [false, true, false, false]);
  assert.equal(calls, 3);
  gate.resolve(page);
  assert.ok(
    (await Promise.all([first, second, cursor, interactive])).every(
      (value) => value === page,
    ),
  );
  await reads.read(input);
  assert.equal(calls, 4, 'settled results are never reused');
});

await test('invalidation rejects the old snapshot without removing a newer read; errors release their slots', async () => {
  const reads = new SocialListReads(),
    page = { items: [], next: null };
  const old = deferred<typeof page>(),
    current = deferred<typeof page>();
  const input = {
    after: null,
    options: {},
    load: () => old.promise,
    observed: () => {},
  };
  const previous = reads.read(input);
  const rejected = assert.rejects(previous, /interrupted/u);
  reads.clear();
  const fresh = reads.read({ ...input, load: () => current.promise });
  old.resolve(page);
  await rejected;
  assert.equal(reads.read(input), fresh);
  current.resolve(page);
  assert.equal(await fresh, page);
  await assert.rejects(
    reads.read({
      ...input,
      load: () => Promise.reject(new Error('Synthetic refusal')),
    }),
    /Synthetic refusal/u,
  );
  assert.equal(
    await reads.read({ ...input, load: () => Promise.resolve(page) }),
    page,
  );
});

await test('in-flight list reads have a bounded budget and clear releases it', async () => {
  const reads = new SocialListReads(),
    page = { items: [], next: null };
  const gate = deferred<typeof page>();
  const works = Array.from({ length: 64 }, () =>
    reads.read({
      after: crypto.randomUUID(),
      options: {},
      load: () => gate.promise,
      observed: () => {},
    }),
  );
  await assert.rejects(
    reads.read({
      after: null,
      options: {},
      load: () => gate.promise,
      observed: () => {},
    }),
    /interrupted/u,
  );
  const settled = Promise.allSettled(works);
  reads.clear();
  const current = reads.read({
    after: null,
    options: {},
    load: () => gate.promise,
    observed: () => {},
  });
  gate.resolve(page);
  assert.ok((await settled).every((result) => result.status === 'rejected'));
  assert.equal(await current, page);
});
