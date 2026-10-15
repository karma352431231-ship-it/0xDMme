import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { groupParticipant } from './fixtures/group-participant.ts';
import { sealBlock, sealCommit } from '../src/client/vault-crypto/index.ts';
import { bytesHash } from '../src/shared/vault/index.ts';
import { encode } from '../src/shared/account/index.ts';
import type { VaultSync } from '../src/client/vault-sync/index.ts';
import type { AddressBook } from '../src/client/contacts/agenda.ts';
import type { RemovalIndex } from '../src/client/personal-removals/index.ts';

const bundle = await build({
  stdin: {
    contents: `export { VaultSync } from './src/client/vault-sync/index.ts';
      export { AddressBook } from './src/client/contacts/agenda.ts';
      export { RemovalIndex } from './src/client/personal-removals/index.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'opening',
  plugins: [
    {
      name: 'isolated-encrypted-vault-storage',
      setup(builder) {
        builder.onResolve({ filter: /vault-storage\/index\.ts$/ }, () => ({
          path: 'storage',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: [
            'rememberLocator',
            'localLocator',
            'checkpoint',
            'draft',
            'saveDraft',
            'commitPage',
            'cachedPage',
            'cachedBlock',
            'cacheBlock',
            'storageEstimate',
            'forgetCachedBlock',
          ]
            .map(
              (name) =>
                `export const ${name} = (...args) => fixture.storage(${JSON.stringify(name)}, args);`,
            )
            .join('\n'),
          loader: 'js',
        }));
      },
    },
  ],
});

async function fixture(t: TestContext, count = 16) {
  const owner = await groupParticipant(),
    key = await owner.authority.key(1);
  const cached = new Map<string, Uint8Array>(),
    remote = new Map<string, Uint8Array>();
  let requests = 0,
    authorities = 0,
    removalChecks = 0;
  const context = {
    crypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    AbortSignal,
    DOMException,
    atob,
    btoa,
    navigator: { onLine: true },
    fixture: {
      storage: (name: string, args: unknown[]) => {
        const id = args[1] as string;
        if (name === 'cachedBlock')
          return Promise.resolve(cached.get(id) ?? null);
        if (name === 'cacheBlock') {
          cached.set(id, args[2] as Uint8Array);
          return Promise.resolve();
        }
        throw new Error('Unexpected storage operation: ' + name);
      },
    },
    fetch: (_url: string, init: RequestInit) => {
      requests++;
      const input = JSON.parse(init.body as string) as { id: string };
      return Promise.resolve(
        Response.json({
          id: input.id,
          ciphertext: encode(remote.get(input.id)!),
        }),
      );
    },
    opening: null as unknown,
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const module = context.opening as {
    VaultSync: typeof VaultSync;
    AddressBook: typeof AddressBook;
    RemovalIndex: typeof RemovalIndex;
  };
  t.mock.method(module.RemovalIndex.prototype, 'load', () => {
    removalChecks++;
    return Promise.resolve();
  });
  const access = {
    withVault: <T>(
      _offline: boolean,
      work: (authority: typeof owner.authority) => Promise<T>,
    ) => {
      authorities++;
      return work({ ...owner.authority, offline: _offline });
    },
    withLocalVault: <T>(
      _locator: unknown,
      work: (authority: typeof owner.authority) => Promise<T>,
    ) => work({ ...owner.authority, offline: true }),
  };
  const sync = new module.VaultSync(access);
  const session = { ...owner.authority.session } as Parameters<
    VaultSync['setSession']
  >[0];
  sync.setSession(session);
  for (let i = 0; i < count; i++) {
    const contact = {
      version: 1,
      ecosystem: 'evm',
      address: '0x' + (i + 1).toString(16).padStart(40, '0'),
      alias: 'Synthetic ' + i,
      accountId: null,
      identity: null,
      directory: null,
      identityRevision: 0,
      removed: false,
    };
    const identity = {
      accountId: owner.accountId,
      id: crypto.randomUUID(),
      epoch: 1,
    };
    const bytes = await sealBlock(key, identity, JSON.stringify(contact));
    const change = {
      version: 1 as const,
      kind: 'address-book' as const,
      entity: crypto.randomUUID(),
      parents: [],
      label: 'Synthetic',
    };
    const commit = await sealCommit({
      unsigned: {
        version: 1,
        ...identity,
        deviceId: owner.deviceId,
        directory: owner.head,
        authorityRevision: 1,
        sequence: i + 1,
        previous: null,
        block: { hash: await bytesHash(bytes), bytes: bytes.length },
      },
      change,
      key,
      sign: owner.authority.sign,
    });
    sync.entries.set(commit.id, { commit, change });
    cached.set(commit.id, bytes);
    remote.set(commit.id, bytes);
  }
  return {
    sync,
    book: new module.AddressBook(sync),
    cached,
    remote,
    access,
    owner,
    module,
    context,
    counts: () => ({ requests, authorities, removalChecks }),
  };
}

await test('a saved-contact page reuses authenticated ciphertext with one authority instead of one network round trip per contact', async (t) => {
  const f = await fixture(t);
  const page = await f.book.page();
  assert.equal(page.items.length, 16);
  assert.equal(page.next, null);
  assert.deepEqual(f.counts(), {
    requests: 0,
    authorities: 1,
    removalChecks: 2,
  });
});

await test('an evicted object is fetched once and its verified ciphertext is reused on the next authorized read', async (t) => {
  const f = await fixture(t, 1),
    id = [...f.remote.keys()][0]!;
  f.cached.clear();
  const first = await f.sync.open(id);
  assert.equal(await f.sync.open(id), first);
  assert.deepEqual(f.counts(), {
    requests: 1,
    authorities: 2,
    removalChecks: 4,
  });
});

for (const failure of [
  'authority',
  'removals',
  'removed',
  'corruption',
  'session',
] as const)
  await test(`cached content never bypasses ${failure} failure`, async (t) => {
    const f = await fixture(t, 1),
      id = [...f.cached.keys()][0]!;
    if (failure === 'authority')
      t.mock.method(f.access, 'withVault', () =>
        Promise.reject(new Error('Revoked')),
      );
    if (failure === 'removals')
      t.mock.method(f.module.RemovalIndex.prototype, 'load', () =>
        Promise.reject(new Error('Removal check failed')),
      );
    if (failure === 'removed')
      t.mock.method(f.module.RemovalIndex.prototype, 'has', () => true);
    if (failure === 'corruption')
      f.cached.set(id, new Uint8Array(f.cached.get(id)!.length));
    if (failure === 'session') {
      const storage = f.context.fixture.storage;
      t.mock.method(
        f.context.fixture,
        'storage',
        (name: string, args: unknown[]) => {
          const result = storage(name, args);
          if (name === 'cachedBlock') f.sync.setSession(null);
          return result;
        },
      );
    }
    await assert.rejects(
      f.sync.open(id),
      /Revoked|Removal check failed|removida|corrompido|Sessão/u,
    );
    assert.equal(f.counts().requests, 0);
  });

await test('object pages reject duplicates and excess work before acquiring authority', async (t) => {
  const f = await fixture(t, 1),
    id = [...f.cached.keys()][0]!;
  await assert.rejects(f.sync.openMany([id, id]), /Página/u);
  await assert.rejects(
    f.sync.openMany(Array.from({ length: 17 }, () => crypto.randomUUID())),
    /Página/u,
  );
  assert.equal((await f.sync.openMany([])).length, 0);
  assert.equal(f.counts().authorities, 0);
});

await test('cleanup discovered after decryption rejects the entire cached page', async (t) => {
  const f = await fixture(t, 2);
  let reads = 0;
  t.mock.method(f.module.RemovalIndex.prototype, 'load', () => {
    reads++;
    return Promise.resolve();
  });
  t.mock.method(f.module.RemovalIndex.prototype, 'has', () => reads >= 2);
  await assert.rejects(f.book.page(), /removida/u);
  assert.equal(reads, 2);
  assert.equal(f.counts().requests, 0);
});

await test('explicit offline reading opens only available ciphertext and never starts a remote download', async (t) => {
  const f = await fixture(t, 1),
    id = [...f.cached.keys()][0]!;
  f.context.navigator.onLine = false;
  assert.match(await f.sync.open(id), /Synthetic/u);
  f.cached.clear();
  await assert.rejects(f.sync.open(id), /Reconecte/u);
  assert.equal(f.counts().requests, 0);
});

await test('an entry from another account cannot be opened using a cached block', async (t) => {
  const f = await fixture(t, 1),
    entry = [...f.sync.entries.values()][0]!;
  entry.commit.accountId = crypto.randomUUID();
  await assert.rejects(f.sync.open(entry.commit.id), /outra conta/u);
  assert.equal(f.counts().requests, 0);
});
