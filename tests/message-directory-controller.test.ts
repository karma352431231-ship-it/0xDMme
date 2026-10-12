import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageDirectory } from '../src/client/messages/directory-controller.ts';
import type { Peer } from '../src/shared/contacts/index.ts';
import { deferred } from './fixtures/deferred.ts';

const peer = (accountId: string): Peer & { requester: string } => ({
  accountId,
  requester: 'synthetic-requester',
  ecosystem: 'evm',
  address: '0x' + accountId.padStart(40, '0'),
  name: accountId,
});
function fixture() {
  const remote = [[peer('1')], [peer('2')]],
    archived = [[peer('1'), peer('3')], []];
  const requested: (string | null)[] = [];
  let publications = 0;
  const sources: ConstructorParameters<typeof MessageDirectory>[0] = {
    agenda: {
      load: () => Promise.resolve(),
      prepare: () => Promise.resolve(),
      clear() {},
      more: false,
    },
    contacts: {
      list: () =>
        Promise.resolve({
          items: remote.shift() ?? [],
          blocks: [],
          next: remote.length ? 'next' : null,
        }),
    },
    archivedPeers: (after) => {
      requested.push(after);
      return Promise.resolve({
        items: archived.shift() ?? [],
        next: archived.length ? 'archive-next' : null,
      });
    },
    changed: () => {
      publications++;
    },
  };
  return {
    directory: new MessageDirectory(sources),
    sources,
    requested,
    publications: () => publications,
  };
}
await test('approved peers win over archived copies; bounded pages deduplicate and reset', async () => {
  const f = fixture();
  await f.directory.refresh();
  assert.deepEqual(
    f.directory.peers.map((p) => [p.accountId, !!p.localOnly]),
    [
      ['1', false],
      ['3', true],
    ],
  );
  assert.equal(f.directory.hasMore(true), true);
  await f.directory.refresh(true);
  assert.deepEqual(
    f.directory.peers.map((p) => p.accountId),
    ['1', '3', '2'],
  );
  assert.deepEqual(f.requested, [null, 'archive-next']);
  assert.equal(f.directory.hasMore(true), false);
  await f.directory.refresh();
  assert.deepEqual(f.directory.peers, []);
});
await test('offline directory retains loaded peers and never discovers wallets remotely', async () => {
  const f = fixture();
  await f.directory.refresh();
  f.sources.contacts.list = () =>
    Promise.reject(new Error('Must not contact remote'));
  await f.directory.refresh(false, false);
  assert.deepEqual(
    f.directory.peers.map((p) => p.accountId),
    ['1', '3'],
  );
  assert.equal(f.directory.hasMore(false), false);
});
for (const phase of ['contacts', 'archive', 'prepare'] as const)
  await test(`account switch during ${phase} cannot restore old peers or cursors`, async () => {
    const f = fixture();
    const pending = deferred<void>(),
      started = deferred<void>();
    const wait = async () => {
      started.resolve();
      await pending.promise;
    };
    if (phase === 'contacts')
      f.sources.contacts.list = async () => {
        await wait();
        return { items: [peer('old')], next: 'old', blocks: [] };
      };
    if (phase === 'archive')
      f.sources.archivedPeers = async () => {
        await wait();
        return { items: [peer('old')], next: 'old' };
      };
    if (phase === 'prepare') f.sources.agenda.prepare = wait;
    const loading = f.directory.refresh();
    await started.promise;
    f.directory.clear();
    pending.resolve();
    await assert.rejects(loading, /Sessão alterada/u);
    assert.deepEqual(f.directory.peers, []);
    assert.equal(f.publications(), 0);
  });
