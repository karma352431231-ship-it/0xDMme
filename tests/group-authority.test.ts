import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthorityWork } from '../src/client/devices/authority-work.ts';
import { authorityTurn } from '../src/client/devices/authority-turns.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';
import { GroupAuthority } from '../src/client/groups/authority.ts';
import { PeerIdentity } from '../src/client/peer-identity/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';

function fixture() {
  const session = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
  };
  const vault: VaultAuthority = {
    session,
    offline: false,
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    key: () => Promise.reject(new Error('Sem chave neste teste de ciclo.')),
    sign: () => Promise.resolve('assinatura-sintética'),
  };
  const ownership = { entries: 0, holding: 0 };
  const access: VaultAccess = {
    withVault: async (_offline, work) => {
      ownership.entries++;
      ownership.holding++;
      try {
        return await work(vault);
      } finally {
        ownership.holding--;
      }
    },
    withLocalVault: () => Promise.reject(new Error('Sem cofre offline.')),
  };
  const identities = new PeerIdentity(new VaultSync(access));
  const authority = new GroupAuthority({
    access,
    identities,
    session: () => session,
  });
  return { authority, vault, session, ownership, identities, access };
}

await test('view invalidation hides an old read without rejecting confirmation of its own creation or entry', async () => {
  const { authority } = fixture();
  let viewRevision = 0;
  const expected = viewRevision;
  const readGuard = () => {
    if (expected !== viewRevision) throw new Error('Vista alterada.');
  };
  await assert.rejects(
    authority.run(readGuard, () => {
      viewRevision++;
      return Promise.resolve('conteúdo antigo');
    }),
    /Vista alterada/u,
  );
  assert.equal(
    await authority.mutate(() => {
      viewRevision++;
      return Promise.resolve('saved');
    }),
    'saved',
  );
});

await test('session change or revocation still cancels a mutation, including during its HTTP response', async (t) => {
  const { authority } = fixture();
  await assert.rejects(
    authority.mutate(() => {
      authority.invalidate();
      return Promise.resolve('saved');
    }),
    /Account authorization changed/u,
  );
  t.mock.method(globalThis, 'fetch', () => {
    authority.invalidate();
    return Promise.resolve(Response.json({ status: 'saved' }));
  });
  await assert.rejects(
    authority.mutate((context) => context.api('group-link-revoke', {})),
    /Account authorization changed/u,
  );
});

await test('vault authority must match the current account, device and session', async () => {
  for (const field of ['accountId', 'deviceId', 'csrf'] as const) {
    const { authority, vault, session } = fixture();
    vault.session = { ...session, [field]: crypto.randomUUID() };
    await assert.rejects(
      authority.mutate(() => Promise.resolve('saved')),
      /Account changed/u,
    );
  }
});

await test('a rate-limited group read waits outside the vault and runs again under fresh authority', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { authority, ownership } = fixture();
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => {
    requests++;
    return Promise.resolve(
      requests === 1
        ? Response.json({ error: 'Too many requests.' }, { status: 429 })
        : Response.json({ items: [] }),
    );
  });
  const read = authority.run(
    () => {},
    (context) => context.api('group-message-snapshot', {}),
  );
  for (let step = 0; step < 70 && requests < 2; step++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (requests === 1)
      assert.equal(ownership.holding, 0, 'the wait releases the vault');
    t.mock.timers.tick(1000);
  }
  assert.deepEqual(await read, { items: [] });
  assert.equal(requests, 2);
  assert.equal(ownership.entries, 2, 'the retry reacquires authority');
});

await test('only outgoing group text staging expresses draft intent; local history keeps its existing admission', async (t) => {
  const { GroupController } =
    await import('../src/client/groups/controller.ts');
  const { GroupCache } = await import('../src/client/groups/cache.ts');
  const { groupParticipant } = await import('./fixtures/group-participant.ts');
  const owner = await groupParticipant();
  const admissions: {
    offline: boolean;
    options: import('../src/client/vault-authority/index.ts').VaultWorkOptions;
  }[] = [];
  const access: VaultAccess = {
    withVault: (offline, work, options = {}) => {
      admissions.push({ offline, options });
      return work(owner.authority);
    },
    withLocalVault: () =>
      Promise.reject(
        new Error('Group staging retains full offline vault authority'),
      ),
  };
  t.mock.method(GroupCache.prototype, 'put', () => Promise.resolve());
  t.mock.method(GroupCache.prototype, 'page', () =>
    Promise.resolve({ items: [], next: null }),
  );
  const controller = new GroupController(
    access,
    new VaultSync(access),
    () => false,
  );
  controller.setSession(
    owner.authority
      .session as import('../src/shared/account/index.ts').AccountSession,
  );
  const group = crypto.randomUUID();
  await controller.composeText(group, {
    id: crypto.randomUUID(),
    text: 'Synthetic draft',
    order: 1,
  });
  assert.equal(admissions[0]!.offline, true);
  assert.equal(admissions[0]!.options.intent, 'outgoing-draft');
  assert.equal(admissions[0]!.options.diagnosticOperation, 'group-draft');
  controller.selected = {
    state: { groupId: group },
  } as import('../src/client/groups/controller.ts').GroupSummary;
  await controller.pending();
  assert.equal(admissions[1]!.offline, true);
  assert.equal(admissions[1]!.options.intent, undefined);
  assert.equal(admissions[1]!.options.priority, undefined);
});

await test('a send confirms already verified pins inside its current authority and releases its scoped read', async (t) => {
  const f = fixture();
  let confirmed = 0,
    disposed = 0;
  t.mock.method(f.identities, 'prepareRead', () => ({
    confirm: (authority: VaultAuthority) => {
      assert.equal(authority, f.vault);
      assert.equal(f.ownership.holding, 1);
      confirmed++;
      return Promise.resolve(true);
    },
    hydrate: () => Promise.reject(new Error('A send keeps its identity owner')),
    dispose: () => {
      disposed++;
    },
  }));
  t.mock.method(f.identities, 'load', () =>
    Promise.reject(new Error('No second authority for unchanged pins')),
  );
  const value = await f.authority.send(
    () => {},
    () => {
      assert.equal(confirmed, 1);
      assert.equal(f.ownership.holding, 1);
      return Promise.resolve('accepted');
    },
  );
  assert.equal(value, 'accepted');
  assert.equal(f.ownership.entries, 1);
  assert.equal(f.ownership.holding, 0);
  assert.equal(disposed, 1);
});

await test('a changed prepared vault leaves exclusion before full identity refresh and reacquires before publication', async (t) => {
  const f = fixture(),
    order: string[] = [];
  t.mock.method(f.identities, 'prepareRead', () => ({
    confirm: () => {
      order.push('stale');
      return Promise.resolve(false);
    },
    hydrate: () => Promise.resolve(false),
    dispose: () => {
      order.push('dispose');
    },
  }));
  t.mock.method(f.identities, 'load', () => {
    assert.equal(f.ownership.holding, 0);
    order.push('full-refresh');
    return Promise.resolve();
  });
  await f.authority.send(
    () => {},
    () => {
      assert.equal(f.ownership.holding, 1);
      order.push('publish');
      return Promise.resolve();
    },
  );
  assert.deepEqual(order, ['stale', 'dispose', 'full-refresh', 'publish']);
  assert.equal(f.ownership.entries, 2);
});

for (const failure of ['confirm', 'publication', 'account'] as const)
  await test(`a ${failure} failure cannot bypass pin verification and disposes the prepared send read`, async (t) => {
    const f = fixture();
    let disposed = 0,
      published = false;
    t.mock.method(f.identities, 'prepareRead', () => ({
      confirm: () =>
        failure === 'confirm'
          ? Promise.reject(new Error('Confirmation failed'))
          : Promise.resolve(true),
      hydrate: () => Promise.resolve(false),
      dispose: () => {
        disposed++;
      },
    }));
    t.mock.method(f.identities, 'load', () =>
      Promise.reject(new Error('Failure cannot silently fall back')),
    );
    if (failure === 'account')
      f.vault.session = { ...f.vault.session, deviceId: crypto.randomUUID() };
    await assert.rejects(
      f.authority.send(
        () => {},
        () => {
          published = true;
          return Promise.reject(new Error('Publication response lost'));
        },
      ),
    );
    assert.equal(disposed, 1);
    assert.equal(published, failure === 'publication');
    assert.equal(f.ownership.holding, 0);
  });

for (const dueMaintenance of [false, true])
  await test(`prepared group sending keeps one verified turn while due maintenance=${dueMaintenance} retains its share`, async (t) => {
    const f = fixture(),
      order: string[] = [];
    const q = new AuthorityWork((key, body, options) =>
      authorityTurn(key, body, options),
    );
    const release = deferred<void>(),
      entered = deferred<void>();
    const jobs: Promise<unknown>[] = [];
    t.after(async () => {
      release.resolve();
      await Promise.allSettled(jobs);
    });
    f.access.withVault = (_offline, work, options = {}) =>
      q.hold(f.session.accountId, () => work(f.vault), options.priority);
    t.mock.method(f.identities, 'prepareRead', () => ({
      confirm: async () => {
        order.push('confirm-pins');
        await Promise.resolve();
        return true;
      },
      hydrate: () => Promise.resolve(false),
      dispose() {},
    }));
    jobs.push(
      q.hold(
        f.session.accountId,
        async () => {
          entered.resolve();
          await release.promise;
        },
        'interactive',
      ),
    );
    await waitForBoundary(entered.promise);
    if (dueMaintenance)
      for (let i = 0; i < 3; i++)
        jobs.push(
          q.hold(f.session.accountId, () => Promise.resolve(), 'interactive'),
        );
    jobs.push(
      q.hold(f.session.accountId, () => {
        order.push('media');
        return Promise.resolve();
      }),
    );
    jobs.push(
      f.authority.send(
        () => {},
        () => {
          order.push('publish');
          return Promise.resolve();
        },
        { priority: 'interactive' },
      ),
    );
    release.resolve();
    await Promise.all(jobs);
    assert.deepEqual(
      order,
      dueMaintenance
        ? ['media', 'confirm-pins', 'publish']
        : ['confirm-pins', 'publish', 'media'],
    );
  });
