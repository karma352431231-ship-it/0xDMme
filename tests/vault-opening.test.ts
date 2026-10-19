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
import type {
  VaultAuthority,
  VaultWorkOptions,
} from '../src/client/vault-authority/index.ts';
import type { VaultDraft } from '../src/client/vault-storage/index.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';

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
  let localDraft: VaultDraft | null = null;
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
        if (name === 'checkpoint')
          return Promise.resolve({ sequence: 0, head: null, used: 0 });
        if (name === 'draft') return Promise.resolve(localDraft);
        if (name === 'cachedPage') return Promise.resolve([]);
        if (name === 'commitPage') return Promise.resolve();
        if (name === 'localLocator')
          return Promise.resolve(owner.authority.session);
        if (name === 'saveDraft') {
          localDraft = args[1] as VaultDraft | null;
          return Promise.resolve();
        }
        throw new Error('Unexpected storage operation: ' + name);
      },
    },
    fetch: (url: string, init: RequestInit) => {
      requests++;
      if (url.endsWith('/vault/read'))
        return Promise.resolve(
          Response.json({
            sequence: 0,
            head: null,
            used: 0,
            commits: [],
            pending: [],
          }),
        );
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

for (const failed of [false, true])
  await test(`cold pages cap downloads at four and settle children before releasing authority: failure=${failed}`, async (t) => {
    const f = await fixture(t, 16),
      ids = [...f.remote.keys()];
    f.cached.clear();
    let active = 0,
      peak = 0;
    const fetch = f.context.fetch;
    t.mock.method(
      f.context,
      'fetch',
      async (url: string, init: RequestInit) => {
        const input = JSON.parse(init.body as string) as { id: string };
        active++;
        peak = Math.max(peak, active);
        try {
          await new Promise<void>((resolve) => setImmediate(resolve));
          if (failed && input.id === ids[0])
            throw new Error('Synthetic object failure');
          return await fetch(url, init);
        } finally {
          active--;
        }
      },
    );
    if (failed)
      await assert.rejects(f.sync.openMany(ids), /vault\/object.*network/u);
    else assert.equal((await f.sync.openMany(ids)).length, 16);
    assert.equal(peak, 4);
    assert.equal(active, 0);
    assert.equal(f.counts().requests, failed ? 3 : 16);
    assert.equal(f.cached.size, failed ? 3 : 16);
  });

/** Hold the external authority boundary; the actual VaultSync work stays intact. */
function holdAuthorities(
  t: TestContext,
  f: Awaited<ReturnType<typeof fixture>>,
) {
  const jobs: (() => Promise<void>)[] = [];
  const priorities: (string | undefined)[] = [];
  const native = f.access.withVault;
  t.mock.method(
    f.access,
    'withVault',
    <T>(
      offline: boolean,
      work: (authority: VaultAuthority) => Promise<T>,
      options?: VaultWorkOptions,
    ) => {
      priorities.push(options?.priority);
      const result = deferred<T>();
      jobs.push(async () => {
        try {
          result.resolve(await native(offline, work));
        } catch (error: unknown) {
          result.reject(error);
        }
      });
      return result.promise;
    },
  );
  return {
    jobs,
    priorities,
    next: async () => {
      const start = jobs.shift();
      assert.ok(start, 'An authority operation is queued');
      await start();
    },
    drain: async () => {
      while (jobs.length) await jobs.shift()!();
    },
  };
}

await test('queued refresh callers coalesce into one fresh authority and vault read', async (t) => {
  const f = await fixture(t, 0),
    queue = holdAuthorities(t, f);
  const done = Promise.all([
    f.sync.refresh(),
    f.sync.refresh(),
    f.sync.refresh(),
  ]);
  const queued = queue.jobs.length;
  await queue.drain();
  await done;
  assert.equal(queued, 1);
  assert.deepEqual(f.counts(), {
    requests: 1,
    authorities: 1,
    removalChecks: 1,
  });
  const next = f.sync.refresh();
  assert.equal(queue.jobs.length, 1);
  await queue.drain();
  await next;
  assert.equal(f.counts().requests, 2);
});

await test('a refresh arriving after reading begins gets another fresh read', async (t) => {
  const f = await fixture(t, 0),
    queue = holdAuthorities(t, f);
  const entered = deferred<void>(),
    release = deferred<void>(),
    fetch = f.context.fetch;
  t.mock.method(f.context, 'fetch', async (url: string, init: RequestInit) => {
    entered.resolve();
    await release.promise;
    return fetch(url, init);
  });
  const first = f.sync.refresh(),
    active = queue.next();
  await waitForBoundary(entered.promise);
  const later = Promise.all([f.sync.refresh(), f.sync.refresh()]);
  const queued = queue.jobs.length;
  release.resolve();
  await active;
  await first;
  await queue.drain();
  await later;
  assert.equal(queued, 1);
  assert.equal(f.counts().requests, 2);
});

await test('queued refresh failures reach every caller and allow a new attempt', async (t) => {
  const f = await fixture(t, 0),
    queue = holdAuthorities(t, f);
  const load = t.mock.method(f.module.RemovalIndex.prototype, 'load', () =>
    Promise.reject(new Error('Revoked')),
  );
  const failed = [
    assert.rejects(f.sync.refresh(), /Revoked/u),
    assert.rejects(f.sync.refresh(), /Revoked/u),
  ];
  await queue.drain();
  await Promise.all(failed);
  assert.equal(f.counts().authorities, 1);
  load.mock.restore();
  const retry = f.sync.refresh();
  await queue.drain();
  await retry;
  assert.equal(f.counts().requests, 1);
});

await test('session replacement prevents joining a queued refresh from the old session', async (t) => {
  const f = await fixture(t, 0),
    queue = holdAuthorities(t, f);
  const old = assert.rejects(f.sync.refresh(), /Sessão/u);
  f.sync.setSession({ ...f.sync.session!, csrf: 'replacement' });
  const current = f.sync.refresh();
  const queued = queue.jobs.length;
  await queue.drain();
  await old;
  await current;
  assert.equal(queued, 2);
  assert.equal(f.counts().requests, 1);
});

await test('online refresh cannot join a queued offline-only refresh', async (t) => {
  const f = await fixture(t, 0),
    queue = holdAuthorities(t, f);
  f.context.navigator.onLine = false;
  const local = f.sync.refresh();
  f.context.navigator.onLine = true;
  const online = f.sync.refresh();
  const queued = queue.jobs.length;
  await queue.drain();
  await Promise.all([local, online]);
  assert.equal(queued, 2);
  assert.equal(f.counts().requests, 1);
});

await test('a queued save separates refreshes and the later refresh observes its encrypted draft', async (t) => {
  const f = await fixture(t, 0),
    queue = holdAuthorities(t, f);
  f.context.navigator.onLine = false;
  const first = f.sync.refresh();
  const save = f.sync.save({
    change: {
      version: 1,
      kind: 'address-book',
      entity: crypto.randomUUID(),
      parents: [],
      label: 'Synthetic',
    },
    value: 'Synthetic draft',
  });
  const later = f.sync.refresh();
  const queued = queue.jobs.length;
  await queue.drain();
  await Promise.all([first, save, later]);
  assert.equal(queued, 3);
  assert.ok(
    f.sync.pending,
    'The later read retains the persisted encrypted draft',
  );
  assert.equal(f.counts().requests, 0);
});

await test('explicit local opening is an ordering barrier for queued refreshes', async (t) => {
  const f = await fixture(t, 0),
    queue = holdAuthorities(t, f);
  const first = f.sync.refresh();
  const local = f.sync.openLocal();
  const later = f.sync.refresh();
  const queued = queue.jobs.length;
  await queue.drain();
  await Promise.all([first, local, later]);
  assert.equal(queued, 2);
});

await test('interactive vault work does not join queued maintenance and retains its priority', async (t) => {
  const f = await fixture(t, 0),
    queue = holdAuthorities(t, f);
  const maintenance = f.sync.refresh();
  const opening = f.sync.refresh({ priority: 'interactive' });
  const sameOpening = f.sync.refresh({ priority: 'interactive' });
  const priorities = [...queue.priorities];
  await queue.drain();
  await Promise.all([maintenance, opening, sameOpening]);
  assert.deepEqual(priorities, [undefined, 'interactive']);
  assert.equal(f.counts().requests, 2);
});

await test('interactive pin object reads retain fresh authority and both removal checks', async (t) => {
  const f = await fixture(t, 1),
    queue = holdAuthorities(t, f);
  const id = [...f.remote.keys()][0]!;
  const opening = f.sync.openMany([id], { priority: 'interactive' });
  assert.deepEqual(queue.priorities, ['interactive']);
  await queue.drain();
  await opening;
  assert.equal(f.counts().removalChecks, 2);
});

await test('interactive pin persistence retains authority priority and cannot write after authority failure', async (t) => {
  const f = await fixture(t, 0);
  const failure = new Error('Fresh save authority refused');
  t.mock.method(
    f.access,
    'withVault',
    <T>(
      _offline: boolean,
      _work: (authority: VaultAuthority) => Promise<T>,
      options?: VaultWorkOptions,
    ) => {
      assert.equal(options?.priority, 'interactive');
      return Promise.reject(failure);
    },
  );
  await assert.rejects(
    f.sync.save(
      {
        change: {
          version: 1,
          entity: crypto.randomUUID(),
          kind: 'contact',
          parents: [],
          label: 'Identidade para mensagens',
        },
        value: 'Synthetic pin',
      },
      { priority: 'interactive' },
    ),
    (error: unknown) => error === failure,
  );
  assert.equal(f.counts().requests, 0);
  assert.equal(f.sync.pending, null);
});
