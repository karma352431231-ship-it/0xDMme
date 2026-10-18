import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { CallIdentity } from '../src/client/call-identity/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import type { VaultEntry } from '../src/client/vault-sync/index.ts';
async function fixture(t: TestContext) {
  const peer = await groupParticipant();
  let refreshed = 0,
    remoteRemoval = false,
    work = 0;
  const sync = {
    complete: true,
    state: { sequence: 0, head: null, used: 0 },
    removalCursor: 0,
    currentHeads: () => new Map<string, VaultEntry[]>(),
    isRemoved: () => false,
    refresh: () => {
      refreshed++;
      if (remoteRemoval) {
        sync.removalCursor++;
        remoteRemoval = false;
      }
      return Promise.resolve();
    },
    openMany: () => Promise.resolve([]),
    save: () => Promise.resolve(),
  };
  const authority: VaultAuthority = {
    session: {
      accountId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      csrf: 'a'.repeat(64),
    },
    directory: 'a'.repeat(64),
    epoch: 1,
    events: [],
    offline: false,
    key: () => {
      throw new Error('No content key in this contract.');
    },
    sign: () => Promise.resolve('synthetic'),
  };
  const access: VaultAccess = {
    withVault: (_offline, fn) => fn(authority),
    withLocalVault: () => {
      throw new Error('Offline forbidden.');
    },
  };
  let directory: unknown = {
    events: [peer.directory],
    revision: 1,
    head: peer.head,
  };
  let raw: unknown = null;
  let mutate = false;
  const operations: string[] = [];
  t.mock.method(globalThis, 'fetch', (url: unknown) => {
    const op = String(url).split('/').at(-1)!;
    operations.push(op);
    if (mutate) {
      sync.removalCursor++;
      mutate = false;
    }
    return Promise.resolve(
      Response.json(
        raw ??
          (op === 'peer-directory'
            ? directory
            : {
                vault: { ...sync.state, commits: [], pending: [] },
                removals: { items: remoteRemoval ? [{}] : [], next: null },
                peer: directory,
              }),
      ),
    );
  });
  const identity = new CallIdentity(access, sync);
  return {
    identity,
    peer,
    sync,
    operations,
    count: () => ({ refreshed, work }),
    remove: () => {
      remoteRemoval = true;
    },
    raw: (value: unknown) => {
      raw = value;
    },
    directory: (value: unknown) => {
      directory = value;
    },
    mutate: () => {
      mutate = true;
    },
    run: () =>
      identity.withPeer(peer.accountId, () => {
        work++;
        return Promise.resolve(true);
      }),
  };
}
await test('warm call identity still reads current vault, removals and peer; unchanged state avoids repeated hydration', async (t) => {
  const f = await fixture(t);
  assert.equal(f.identity.current, null);
  await f.run();
  assert.ok(f.identity.current);
  await f.run();
  assert.deepEqual(f.operations, ['call-context', 'call-context']);
  assert.deepEqual(f.count(), { refreshed: 1, work: 2 });
  f.remove();
  await f.run();
  assert.equal(
    f.sync.state.head,
    null,
    'personal removal did not advance vault head',
  );
  assert.equal(f.sync.removalCursor, 1);
  assert.deepEqual(f.count(), { refreshed: 2, work: 3 });
});
await test('malformed or divergent fresh context never runs cryptographic work', async (t) => {
  const f = await fixture(t);
  for (const value of [
    {},
    {
      vault: {
        sequence: 1,
        head: 'b'.repeat(64),
        used: 0,
        commits: [],
        pending: [],
      },
      removals: { items: [], next: null },
      peer: {},
    },
    {
      vault: { sequence: 0, head: null, used: 0, commits: [], pending: [] },
      removals: { items: [], next: 9 },
      peer: {},
    },
  ]) {
    f.raw(value);
    await assert.rejects(f.run());
  }
  assert.equal(f.count().work, 0);
});
await test('local concurrent change and root substitution cannot reuse a loaded pin', async (t) => {
  const f = await fixture(t);
  await f.run();
  f.sync.removalCursor++;
  assert.equal(
    f.identity.current,
    null,
    'a new local removal cannot seed cached setup',
  );
  f.mutate();
  await f.run();
  assert.equal(f.count().refreshed, 3);
  const replacement = await groupParticipant({ accountId: f.peer.accountId });
  f.directory({
    events: [replacement.directory],
    head: replacement.head,
    revision: 1,
  });
  await assert.rejects(f.run(), /Identidade|identidade/u);
  assert.equal(f.count().work, 2);
});
await test('legacy server path uses existing peer-directory and fully refreshes identity pins', async (t) => {
  const f = await fixture(t);
  f.identity.enable(false);
  await f.run();
  await f.run();
  assert.deepEqual(f.operations, ['peer-directory', 'peer-directory']);
  assert.equal(f.count().refreshed, 2);
});

await test('session preparation shares one pin load with a concurrent call and never replaces fresh context reads', async (t) => {
  const f = await fixture(t);
  await Promise.all([f.identity.prime(), f.identity.prime(), f.run()]);
  assert.equal(f.count().refreshed, 1);
  assert.deepEqual(f.operations, ['call-context']);
  await f.run();
  assert.deepEqual(f.operations, ['call-context', 'call-context']);
});
