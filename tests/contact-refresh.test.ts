import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refreshContactSources } from '../src/client/contacts/refresh.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';

await test('both contact sources queue behind a complete verified vault and finish before presentation', async () => {
  const vault = deferred<void>(),
    sources = deferred<void>(),
    entered = deferred<void>();
  let reads = 0;
  const sync = {
    complete: false,
    pending: null,
    retry: async () => {},
    refresh: async () => {
      await vault.promise;
      sync.complete = true;
    },
  };
  const read = async () => {
    assert.equal(sync.complete, true);
    if (++reads === 2) entered.resolve();
    await sources.promise;
  };
  const loading = refreshContactSources({
    sync,
    trace: undefined,
    contacts: {
      snapshot: async () => {
        await read();
        return { items: [], blocks: [], next: null };
      },
    },
    directory: { load: read, entries: [] },
  });
  assert.equal(reads, 0);
  vault.resolve();
  await waitForBoundary(entered.promise);
  sources.resolve();
  assert.equal(await loading, 0);
});

await test('contact failure waits for the other authorized source and rejects the refresh', async () => {
  const agenda = deferred<void>(),
    started = deferred<void>();
  let settled = false;
  const loading = refreshContactSources({
    trace: undefined,
    sync: {
      complete: true,
      pending: null,
      refresh: async () => {},
      retry: async () => {},
    },
    contacts: {
      snapshot: () => Promise.reject(new Error('Permission revoked.')),
    },
    directory: {
      load: () => {
        started.resolve();
        return agenda.promise;
      },
      entries: [],
    },
  });
  const rejected = assert.rejects(
    loading.finally(() => {
      settled = true;
    }),
    /Permission revoked/,
  );
  await waitForBoundary(started.promise);
  await Promise.resolve();
  assert.equal(settled, false);
  agenda.resolve();
  await rejected;
});
