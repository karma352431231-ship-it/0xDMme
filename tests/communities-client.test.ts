import {
  communityView,
  postReturnTarget,
} from '../src/client/communities/navigation.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from '../src/shared/account/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import { Communities } from '../src/client/communities/controller.ts';
import {
  togglePostPreference,
  togglePostVote,
} from '../src/client/communities/post-interactions.ts';
import type { CommunityPost } from '../src/shared/community-posts/index.ts';
import { feedPage } from '../src/shared/community-discovery/index.ts';
import { publicAvatarPath } from '../src/shared/public-media/index.ts';

function session(): AccountSession {
  return {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    name: 'Privado',
    address: `0x${'1'.repeat(40)}`,
    ecosystem: 'evm',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    profileRevision: 0,
    walletConfirmed: true,
  };
}
function access(
  account: AccountSession,
  signing: () => Promise<string>,
): VaultAccess {
  const authority: VaultAuthority = {
    session: account,
    offline: false,
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    sign: signing,
    key: () =>
      Promise.reject(new Error('Operação não precisa de chave de conteúdo.')),
  };
  return {
    withVault: (_offline, work) => work(authority),
    withLocalVault: (_locator, work) => work(authority),
  };
}
const result = () => ({
  community: {
    id: crypto.randomUUID(),
    name: 'Sintética',
    description: '',
    rules: '',
    revision: 1,
    archived: false,
    avatar: null,
    owner: null,
    followers: 0,
  },
  role: 'participant',
  following: false,
  canPost: true,
  pendingPhoto: null,
  sanction: null,
  transfer: null,
});
await test('session change during community signing blocks sending with old authority', async (t) => {
  const first = session();
  let started: () => void = () => {
    throw new Error('Não iniciado.');
  };
  let finish: (signature: string) => void = () => {
    throw new Error('Não iniciado.');
  };
  const signing = new Promise<void>((resolve) => {
      started = resolve;
    }),
    signed = new Promise<string>((resolve) => {
      finish = resolve;
    });
  const controller = new Communities(
    access(first, () => {
      started();
      return signed;
    }),
  );
  controller.setSession(first);
  const fetch = t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json(result())),
  );
  const pending = controller.request('discovery-preference-set', {
    id: crypto.randomUUID(),
    post: crypto.randomUUID(),
    preference: { saved: true, hidden: false, revision: 0 },
  });
  await signing;
  controller.setSession(session());
  finish('assinatura-sintetica');
  await assert.rejects(pending, /Session changed/);
  assert.equal(fetch.mock.callCount(), 0);
});
await test("late response cannot restore another session's community; state rejects private fields", async (t) => {
  const first = session(),
    controller = new Communities(
      access(first, () => Promise.resolve('assinatura-sintetica')),
    );
  controller.setSession(first);
  let started: () => void = () => {
      throw new Error('Não iniciado.');
    },
    finish: (response: Response) => void = () => {
      throw new Error('Não iniciado.');
    };
  const sent = new Promise<void>((resolve) => {
      started = resolve;
    }),
    response = new Promise<Response>((resolve) => {
      finish = resolve;
    });
  t.mock.method(globalThis, 'fetch', () => {
    started();
    return response;
  });
  const pending = controller.state(crypto.randomUUID());
  await sent;
  controller.setSession(null);
  finish(Response.json(result()));
  await assert.rejects(pending, /Session changed/);
  const clean = new Communities(
    access(first, () => Promise.resolve('assinatura-sintetica')),
  );
  clean.setSession(first);
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json({ ...result(), accountId: first.accountId })),
  );
  await assert.rejects(clean.state(crypto.randomUUID()), /Invalid fields/);
});

function post(): CommunityPost {
  return {
    id: crypto.randomUUID(),
    community: crypto.randomUUID(),
    author: null,
    title: 'Test',
    text: 'Texto público sintético',
    tags: [],
    createdAt: new Date().toISOString(),
    editedAt: null,
    revision: 1,
    status: 'visible',
    parent: null,
    root: null,
    score: 12,
    replies: 3,
  };
}
function voteState(value: CommunityPost, position: number) {
  return {
    post: value,
    own: false,
    manager: false,
    canEdit: false,
    canDelete: false,
    content: null,
    removal: null,
    vote: { position, revision: 7 },
  };
}
await test('vote buttons use the current revision, switch position and remove repeated votes', async () => {
  const value = post();
  for (const [current, clicked, expected] of [
    [0, 1, 1],
    [1, 1, 0],
    [-1, 1, 1],
    [1, -1, -1],
    [-1, -1, 0],
  ] as const) {
    const writes: Record<string, unknown>[] = [];
    await togglePostVote(value, clicked, {
      valid: () => true,
      controller: {
        request: (operation, payload) => {
          if (operation === 'post-vote') writes.push(payload);
          return Promise.resolve(voteState(value, current));
        },
      },
    });
    assert.deepEqual(writes, [
      {
        id: value.community,
        post: value.id,
        position: expected,
        voteRevision: 7,
      },
    ]);
  }
});
await test('page change during a private query blocks subsequent votes or preferences', async () => {
  const value = post();
  for (const kind of ['vote', 'preference'] as const) {
    let valid = true;
    const operations: string[] = [];
    const access = {
      valid: () => valid,
      controller: {
        request: (operation: string) => {
          operations.push(operation);
          valid = false;
          return Promise.resolve(
            kind === 'vote'
              ? voteState(value, 0)
              : { saved: false, hidden: true, revision: 4 },
          );
        },
      },
    };
    if (kind === 'vote') await togglePostVote(value, 1, access);
    else await togglePostPreference(value, 'saved', access);
    assert.equal(operations.length, 1);
  }
});
await test('save and hide preserve the other private preference and current revision', async () => {
  const value = post();
  for (const key of ['saved', 'hidden'] as const) {
    const writes: Record<string, unknown>[] = [];
    const result = await togglePostPreference(value, key, {
      valid: () => true,
      controller: {
        request: (operation, payload) => {
          if (operation === 'discovery-preference-set') writes.push(payload);
          return Promise.resolve({ saved: false, hidden: true, revision: 4 });
        },
      },
    });
    assert.ok(result);
    assert.deepEqual(writes, [
      {
        id: value.community,
        post: value.id,
        preference: {
          saved: key === 'saved',
          hidden: key !== 'hidden',
          revision: 4,
        },
      },
    ]);
  }
});
await test('feed photo accepts the public community projection and rejects other identities or private fields', () => {
  const value = post(),
    avatar = publicAvatarPath(
      'community-photo',
      value.community,
      crypto.randomUUID(),
    ),
    group = { id: value.community, name: 'Comunidade sintética', avatar },
    parse = (community: Record<string, unknown>) =>
      feedPage({ items: [{ post: value, community }], next: null });
  assert.equal(parse(group).items[0]?.community.avatar, avatar);
  assert.equal(
    parse({ id: group.id, name: group.name }).items[0]?.community.avatar,
    null,
  );
  assert.throws(() =>
    parse({
      ...group,
      avatar: publicAvatarPath(
        'community-photo',
        crypto.randomUUID(),
        crypto.randomUUID(),
      ),
    }),
  );
  assert.throws(() => parse({ ...group, wallet: 'privada' }));
});

await test('post arrow returns to the source list or, without a source, to the community', () => {
  const community = crypto.randomUUID();
  assert.equal(
    postReturnTarget('view=feed', community),
    '#communities?view=feed',
  );
  assert.equal(
    postReturnTarget('view=explore&period=week', community),
    '#communities?view=explore&period=week',
  );
  assert.equal(
    postReturnTarget(null, community),
    `#communities?id=${community}`,
  );
});

await test('route opens settings only with a community; unknown screens and legacy list fall back to feed', () => {
  const id = crypto.randomUUID();
  assert.equal(communityView('manage', id), 'manage');
  assert.equal(communityView('manage', null), 'feed');
  assert.equal(communityView('followers', null), 'feed');
  assert.equal(communityView('followers', crypto.randomUUID()), 'followers');
  assert.equal(communityView('managed', null), 'feed');
  assert.equal(communityView('qualquer', id), 'feed');
  assert.equal(communityView('explore', null), 'explore');
});

await test('adjacent parts reuse only the signing context; every request stays signed', async (t) => {
  const account = session();
  let checks = 0,
    signatures = 0;
  const base = access(account, () => Promise.resolve(`signed-${++signatures}`));
  const controller = new Communities({
    ...base,
    withVault: (offline, work) => {
      checks++;
      return base.withVault(offline, work);
    },
  });
  controller.setSession(account);
  const sent: number[] = [];
  t.mock.method(globalThis, 'fetch', (_path: string, options: RequestInit) => {
    assert.equal(typeof options.body, 'string');
    if (typeof options.body !== 'string') throw new Error('Invalid body.');
    const body = JSON.parse(options.body) as {
      signature: string;
      payload: { index: number };
    };
    assert.equal(body.signature, `signed-${body.payload.index + 1}`);
    sent.push(body.payload.index);
    return Promise.resolve(Response.json({ received: body.payload.index + 1 }));
  });
  for (let index = 0; index < 10; index++)
    await controller.request('media-part', { index, bytes: 'synthetic' });
  assert.equal(checks, 1);
  assert.equal(signatures, 10);
  assert.deepEqual(
    sent,
    Array.from({ length: 10 }, (_, index) => index),
  );
});

await test('part context expires and is not used for normal operations', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const account = session();
  let checks = 0;
  const base = access(account, () => Promise.resolve('synthetic'));
  const controller = new Communities({
    ...base,
    withVault: (offline, work) => {
      checks++;
      return base.withVault(offline, work);
    },
  });
  controller.setSession(account);
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json({ received: 1 })),
  );
  await controller.request('media-part', { index: 0 });
  await controller.request('media-part', { index: 1 });
  assert.equal(checks, 1);
  await controller.request('media-status', { media: crypto.randomUUID() });
  assert.equal(checks, 2);
  t.mock.timers.tick(3001);
  await controller.request('media-part', { index: 2 });
  assert.equal(checks, 3);
});

await test('directory rejection invalidates parts; resuming requires a new check and every part requires a signature', async (t) => {
  const account = session();
  let checks = 0,
    head = 'b'.repeat(64);
  const base = access(account, () => Promise.resolve('synthetic-signature'));
  const controller = new Communities({
    ...base,
    withVault: (offline, work) => {
      checks++;
      return base.withVault(offline, (authority) =>
        work({ ...authority, directory: head }),
      );
    },
  });
  controller.setSession(account);
  let requests = 0;
  t.mock.method(globalThis, 'fetch', (_path: string, options: RequestInit) => {
    requests++;
    assert.equal(typeof options.body, 'string');
    if (typeof options.body !== 'string') throw new Error('Invalid body.');
    const body = JSON.parse(options.body) as {
      directory: string;
      signature: string;
    };
    assert.equal(body.signature, 'synthetic-signature');
    return Promise.resolve(
      body.directory === head
        ? Response.json({ received: requests })
        : Response.json(
            { error: 'Device has no current authorization.' },
            { status: 403 },
          ),
    );
  });
  await controller.request('media-part', { index: 0 });
  head = 'c'.repeat(64);
  await assert.rejects(
    controller.request('media-part', { index: 1 }),
    /Device (?:has no (?:current )?authorization|unauthorized)/,
  );
  assert.equal(requests, 2);
  await controller.request('media-part', { index: 1 });
  assert.equal(checks, 2);
  controller.setSession(null);
  await assert.rejects(
    controller.request('media-part', { index: 2 }),
    /Sign in and create/,
  );
  assert.equal(requests, 3);
});

await test('part cache has a usage budget and device changes require a new signature', async (t) => {
  const account = session();
  let checks = 0;
  const base = access(account, () => Promise.resolve('synthetic'));
  const controller = new Communities({
    ...base,
    withVault: (offline, work) => {
      checks++;
      return base.withVault(offline, work);
    },
  });
  controller.setSession(account);
  const fetch = t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json({ received: 1 })),
  );
  for (let index = 0; index < 17; index++)
    await controller.request('media-part', { index });
  assert.equal(checks, 2);
  controller.setSession({ ...account, deviceId: crypto.randomUUID() });
  await assert.rejects(
    controller.request('media-part', { index: 17 }),
    /Session changed/,
  );
  assert.equal(fetch.mock.callCount(), 17);
});
