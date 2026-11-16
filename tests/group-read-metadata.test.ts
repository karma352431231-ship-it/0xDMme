import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { GroupController } from '../src/client/groups/controller.ts';
import { groupGallerySource } from '../src/client/groups/gallery-source.ts';
import { GroupCache } from '../src/client/groups/cache.ts';
import { GroupGovernance } from '../src/client/groups/governance.ts';
import { GroupMessageWindows } from '../src/client/groups/message-windows.ts';
import { PeerIdentity } from '../src/client/peer-identity/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type {
  VaultAccess,
  VaultWorkOptions,
} from '../src/client/vault-authority/index.ts';
import type { GroupEvent } from '../src/shared/groups/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';

// The real controller, authority, signed metadata requests and receipt state.
// The verified-window boundary is held explicitly; window proofs/crypto have
// their own tests, while this suite checks the post-verification contract.
async function fixture(t: TestContext, count = 2) {
  const owner = await groupParticipant(),
    groupId = crypto.randomUUID();
  const state: GroupEvent = {
    version: 1,
    groupId,
    revision: 1,
    epoch: 1,
    previous: null,
    kind: 'create',
    actor: owner.accountId,
    deviceId: owner.deviceId,
    directory: owner.head,
    authorityRevision: 1,
    owner: owner.accountId,
    members: [{ accountId: owner.accountId, role: 'owner', joined: 1 }],
    target: null,
    consent: null,
    signature: 'A'.repeat(86) + '==',
  };
  const head = 'b'.repeat(64);
  const views = Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    groupId,
    sequence: index + 1,
    epoch: 1,
    hash: 'c'.repeat(64),
    sender: index === 0 ? owner.accountId : crypto.randomUUID(),
    own: index === 0,
    kind: 'text' as const,
    text: 'Synthetic verified text',
    unavailableMedia: [],
  }));
  const requests: string[] = [];
  let verified = false,
    pendingSend = true;
  const deferred: string[] = [];
  for (const [name, value] of Object.entries({
    document: { visibilityState: 'visible' },
    navigator: { onLine: true },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const turns: VaultWorkOptions[] = [];
  const access: VaultAccess = {
    withVault: (_offline, work, options = {}) => {
      turns.push(options);
      return work(owner.authority);
    },
    withLocalVault: (_locator, work) => work(owner.authority),
  };
  t.mock.method(PeerIdentity.prototype, 'load', async () => {});
  t.mock.method(PeerIdentity.prototype, 'save', async () => {});
  t.mock.method(GroupCache.prototype, 'get', () => Promise.resolve(null));
  t.mock.method(GroupGovernance.prototype, 'verify', () =>
    Promise.resolve({ state, head }),
  );
  t.mock.method(
    GroupMessageWindows.prototype,
    'read',
    (_context: unknown, before: number | null) => {
      verified = true;
      return Promise.resolve({
        scope: 'synthetic',
        snapshot: { groupId, head, directory: owner.head, revision: 1 },
        views: views
          .filter((view) => before === null || view.sequence < before)
          .slice(-16),
        before: null,
      });
    },
  );
  t.mock.method(globalThis, 'fetch', (url: RequestInfo | URL) => {
    const path =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const operation = path.split('/').at(-1)!;
    assert.equal(verified, true, 'Metadata never precedes verified history.');
    requests.push(operation);
    assert.ok(['group-daily-read', 'group-daily-receipts'].includes(operation));
    return Promise.resolve(
      Response.json(operation === 'group-daily-read' ? {} : []),
    );
  });
  const sync = new VaultSync(access);
  const controller = new GroupController(access, sync, () => true);
  controller.setSession(owner.authority.session as AccountSession);
  return {
    controller,
    access,
    sync,
    authority: owner.authority,
    turns,
    groupId,
    views,
    requests,
    deferred,
    policy: {
      shouldYield: () => pendingSend,
      deferred: (group: string) => deferred.push(group),
    },
    releaseSend() {
      pendingSend = false;
    },
  };
}

await test('the group media catalogue reads every verified page without changing the displayed window or acknowledging reads', async (t) => {
  const f = await fixture(t, 36);
  await f.controller.open(f.groupId);
  const shown = f.controller.views.map((row) => row.id);
  f.requests.length = 0;
  const reader = groupGallerySource({
    access: f.access,
    sync: f.sync,
    session: f.authority.session as AccountSession,
    group: f.groupId,
    localOnly: false,
  });
  const signal = new AbortController().signal;
  const ids = new Set<string>();
  let before: number | null = null;
  try {
    do {
      const page = await reader.page(before, signal);
      for (const row of page.views) ids.add(row.id);
      before = page.next;
    } while (before !== null);
  } finally {
    reader.close();
  }
  assert.equal(ids.size, 36);
  assert.deepEqual(
    f.controller.views.map((row) => row.id),
    shown,
  );
  assert.ok(!f.requests.includes('group-daily-read'));
});

await test('verified group history completes before deferred metadata, while receipt hints never write read acknowledgements', async (t) => {
  const f = await fixture(t);
  await f.controller.open(f.groupId, false, false, { metadata: f.policy });
  assert.deepEqual(f.requests, []);
  assert.deepEqual(f.deferred, [f.groupId]);
  assert.equal(f.controller.historyPending, false);
  assert.deepEqual(f.controller.views, f.views);
  f.releaseSend();
  await f.controller.refreshReadState(f.policy);
  assert.deepEqual(f.requests, ['group-daily-read', 'group-daily-receipts']);
  f.requests.length = 0;
  await f.controller.refreshReceipts(f.policy);
  assert.deepEqual(f.requests, ['group-daily-receipts']);
});

await test('revocation during deferred group metadata cannot apply an old completion', async (t) => {
  const f = await fixture(t);
  await f.controller.open(f.groupId, false, false, { metadata: f.policy });
  f.releaseSend();
  t.mock.method(globalThis, 'fetch', () => {
    f.controller.revokeAuthority();
    return Promise.resolve(Response.json({}));
  });
  await assert.rejects(f.controller.refreshReadState(f.policy));
  assert.deepEqual(f.controller.views, []);
});

for (const current of [true, false])
  await test(`group history uses current-authority pin confirmation before reading; unchanged=${current}`, async (t) => {
    const f = await fixture(t);
    let confirmed = 0,
      loaded = 0,
      disposed = 0;
    t.mock.method(PeerIdentity.prototype, 'prepareRead', () => ({
      confirm: (authority: typeof f.authority) => {
        assert.equal(authority, f.authority);
        confirmed++;
        return Promise.resolve(current);
      },
      hydrate: () =>
        Promise.reject(new Error('The read keeps its identity owner')),
      dispose: () => {
        disposed++;
      },
    }));
    t.mock.method(PeerIdentity.prototype, 'load', () => {
      assert.equal(
        current,
        false,
        'Unchanged pins need no separate identity load',
      );
      loaded++;
      return Promise.resolve();
    });
    await f.controller.open(f.groupId, false, false, { metadata: f.policy });
    assert.equal(confirmed, 1);
    assert.equal(loaded, current ? 0 : 1);
    assert.equal(disposed, 1);
    assert.equal(f.turns.length, current ? 1 : 2);
    assert.ok(f.turns.every((turn) => turn.ownDirectory === 'fresh'));
    assert.deepEqual(f.controller.views, f.views);
    assert.deepEqual(f.deferred, [f.groupId]);
  });

await test('group history rejects revocation during prepared pin confirmation', async (t) => {
  const f = await fixture(t);
  let disposed = 0;
  t.mock.method(PeerIdentity.prototype, 'prepareRead', () => ({
    confirm: () => {
      f.controller.revokeAuthority();
      return Promise.resolve(true);
    },
    hydrate: () => Promise.resolve(false),
    dispose: () => {
      disposed++;
    },
  }));
  t.mock.method(PeerIdentity.prototype, 'load', () =>
    Promise.reject(new Error('Revocation must not trigger a fallback read')),
  );
  await assert.rejects(
    f.controller.open(f.groupId, false, false, { metadata: f.policy }),
  );
  assert.equal(disposed, 1);
  assert.deepEqual(f.controller.views, []);
  assert.deepEqual(f.requests, []);
});
