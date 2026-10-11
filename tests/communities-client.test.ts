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
await test('troca de sessão durante assinatura de comunidade impede envio com autoridade antiga', async (t) => {
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
  await assert.rejects(pending, /Sessão alterada/);
  assert.equal(fetch.mock.callCount(), 0);
});
await test('resposta atrasada não restaura comunidade de outra sessão; estado recusa campos privados', async (t) => {
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
  await assert.rejects(pending, /Sessão alterada/);
  const clean = new Communities(
    access(first, () => Promise.resolve('assinatura-sintetica')),
  );
  clean.setSession(first);
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json({ ...result(), accountId: first.accountId })),
  );
  await assert.rejects(clean.state(crypto.randomUUID()), /Campos inválidos/);
});

function post(): CommunityPost {
  return {
    id: crypto.randomUUID(),
    community: crypto.randomUUID(),
    author: null,
    title: 'Teste',
    text: 'Texto público sintético',
    tag: null,
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
await test('botões de voto usam revisão atual, alternam posição e retiram o voto repetido', async () => {
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
await test('trocar de página durante consulta privada impede voto ou preferência posterior', async () => {
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
await test('salvar e ocultar preservam a outra preferência privada e a revisão corrente', async () => {
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
await test('foto do feed aceita projeção pública da comunidade e recusa outra identidade ou campos privados', () => {
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

await test('seta do post volta à lista de origem; sem origem, à comunidade', () => {
  const community = crypto.randomUUID();
  assert.equal(
    postReturnTarget('view=feed', community),
    '#comunidades?view=feed',
  );
  assert.equal(
    postReturnTarget('view=explore&period=week', community),
    '#comunidades?view=explore&period=week',
  );
  assert.equal(
    postReturnTarget(null, community),
    `#comunidades?id=${community}`,
  );
});

await test('rota abre a configuração só com comunidade; telas desconhecidas e lista antiga caem no feed', () => {
  const id = crypto.randomUUID();
  assert.equal(communityView('manage', id), 'manage');
  assert.equal(communityView('manage', null), 'feed');
  assert.equal(communityView('managed', null), 'feed');
  assert.equal(communityView('qualquer', id), 'feed');
  assert.equal(communityView('explore', null), 'explore');
});
