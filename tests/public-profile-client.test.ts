import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from '../src/shared/account/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import { PublicProfiles } from '../src/client/public-profile/controller.ts';
import {
  blockingNotices,
  startPublicProfile,
} from '../src/client/public-profile/index.ts';
import { publicModerationNotice } from '../src/shared/public-moderation/index.ts';
import type { PublicModerationNotice } from '../src/shared/public-moderation/index.ts';
import { ExternalMediaConsent } from '../src/client/external-media/index.ts';

function session(): AccountSession {
  return {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    name: 'Nome privado',
    address: `0x${'1'.repeat(40)}`,
    ecosystem: 'evm',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    profileRevision: 0,
    walletConfirmed: true,
  };
}
function access(
  session: AccountSession,
  signing: () => Promise<string>,
): VaultAccess {
  const authority: VaultAuthority = {
    session,
    offline: false,
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    sign: signing,
    key: () =>
      Promise.reject(
        new Error('Chave privada não é necessária nesta operação.'),
      ),
  };
  return {
    withVault: (_offline, work) => work(authority),
    withLocalVault: (_locator, work) => work(authority),
  };
}
const result = () => ({
  profile: { id: crypto.randomUUID(), handle: 'sintetico', avatar: null },
  revision: 1,
  pendingAvatar: null,
});
await test('criar @ aguarda a escolha de mídia externa, sem caixa adicional para o nome', async (t) => {
  for (const [name, value] of Object.entries({
    document: { querySelectorAll: () => [] },
    window: new EventTarget(),
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const own = session();
  let click = () => {};
  const button = {
    addEventListener: (_event: string, listener: () => void) => {
      click = listener;
    },
    disabled: false,
  };
  const host = {
    innerHTML: '',
    querySelector: (selector: string) => {
      if (selector === '[data-public-action="create"]') return button;
      if (selector === '[data-public-input]') return { value: '@sintetico' };
      return null;
    },
    querySelectorAll: () => [],
  };
  const requests: { handle: string; consent: boolean }[] = [];
  t.mock.method(PublicProfiles.prototype, 'refresh', async () => {});
  t.mock.method(
    PublicProfiles.prototype,
    'create',
    (handle: string, consent: boolean) => {
      requests.push({ handle, consent });
      return Promise.resolve();
    },
  );
  let choose: (choice: boolean | null) => void = () => {};
  const privacy = new ExternalMediaConsent({
    profile: () => Promise.resolve(false),
    storage: null,
    prompt: () =>
      new Promise((resolve) => {
        choose = resolve;
      }),
  });
  privacy.setSession(own);
  const ui = startPublicProfile(
    access(own, () => Promise.resolve('assinatura-sintetica')),
    privacy,
  );
  ui.mount(host as unknown as HTMLElement);
  await new Promise<void>((resolve) => setImmediate(resolve));
  click();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(requests, []);
  choose(false);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(requests, [{ handle: '@sintetico', consent: true }]);
  assert.equal(host.innerHTML.includes('data-public-consent'), false);
  assert.equal(privacy.permitted('video'), false);
  ui.leave();
});
await test('configurações só avisam quando a análise mantém o arquivo fora do público', () => {
  const shown = [
    'rejected',
    'held',
    'failed',
    'discarding',
    'expired',
  ] as const;
  const hidden = ['pending', 'analyzing', 'approved', 'removed'] as const;
  const notices = [...hidden, ...shown].map(
    (status) => ({ id: status, status }) as unknown as PublicModerationNotice,
  );
  assert.deepEqual(
    blockingNotices(notices).map((notice) => notice.status),
    [...shown],
  );
});
await test('análises anteriores substituem a página sem acumular avisos; cursor é assinado e sessão limpa a navegação', async (t) => {
  const own = session(),
    controller = new PublicProfiles(
      access(own, () => Promise.resolve('assinatura-sintetica')),
    );
  controller.setSession(own);
  const page = Array.from({ length: 32 }, () => ({
    id: crypto.randomUUID(),
    target: crypto.randomUUID(),
    kind: 'post-media',
    status: 'expired',
    createdAt: '2026-10-06T00:00:00.000Z',
    expiresAt: '2026-10-13T00:00:00.000Z',
    appeal: null,
    decision: null,
  }));
  const payloads: unknown[] = [];
  t.mock.method(globalThis, 'fetch', (_url: string, input: RequestInit) => {
    assert.equal(typeof input.body, 'string');
    if (typeof input.body !== 'string')
      throw new Error('Prova precisa de JSON.');
    payloads.push(JSON.parse(input.body) as unknown);
    return Promise.resolve(Response.json(payloads.length === 1 ? page : []));
  });
  await controller.refreshModeration();
  const cursor = controller.moderationOlder;
  assert.equal(cursor, page[31]!.id);
  await controller.refreshModeration(cursor);
  assert.deepEqual(controller.notices, []);
  assert.equal(controller.moderationAfter, cursor);
  assert.equal(controller.moderationOlder, null);
  assert.deepEqual(payloads[1], {
    directory: 'b'.repeat(64),
    payload: { after: cursor },
    signature: 'assinatura-sintetica',
  });
  controller.setSession(null);
  assert.equal(controller.moderationAfter, null);
});
await test('aviso atrasado de análise não reaparece após troca de conta', async (t) => {
  const first = session(),
    controller = new PublicProfiles(
      access(first, () => Promise.resolve('assinatura-sintetica')),
    );
  controller.setSession(first);
  const notice = publicModerationNotice({
    id: crypto.randomUUID(),
    target: crypto.randomUUID(),
    kind: 'avatar',
    status: 'held',
    createdAt: '2026-10-06T00:00:00.000Z',
    expiresAt: '2026-10-13T00:00:00.000Z',
    appeal: null,
    decision: null,
  });
  let finish: (response: Response) => void = () => {
    throw new Error('Resposta não preparada.');
  };
  let sent: () => void = () => {
    throw new Error('Pedido não preparado.');
  };
  const response = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const started = new Promise<void>((resolve) => {
    sent = resolve;
  });
  t.mock.method(globalThis, 'fetch', () => {
    sent();
    return response;
  });
  const pending = controller.refreshModeration();
  await started;
  controller.setSession(session());
  finish(Response.json([notice]));
  await assert.rejects(pending, /Sessão alterada/);
  assert.deepEqual(controller.notices, []);
});
await test('resposta atrasada do perfil público não repõe identidade após troca de conta', async (t) => {
  const first = session(),
    controller = new PublicProfiles(
      access(first, () => Promise.resolve('assinatura-sintetica')),
    );
  controller.setSession(first);
  let finish: (response: Response) => void = () => {
    throw new Error('Resposta não preparada.');
  };
  const response = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  let sent: () => void = () => {
    throw new Error('Pedido não preparado.');
  };
  const started = new Promise<void>((resolve) => {
    sent = resolve;
  });
  t.mock.method(globalThis, 'fetch', () => {
    sent();
    return response;
  });
  const pending = controller.refresh();
  await started;
  controller.setSession(session());
  finish(Response.json(result()));
  await assert.rejects(pending, /Sessão alterada/);
  assert.equal(controller.profile, null);
});
await test('troca de sessão durante assinatura impede o envio e campos privados são recusados', async (t) => {
  const first = session();
  let complete: (signature: string) => void = () => {
    throw new Error('Assinatura não preparada.');
  };
  let signing: () => void = () => {
    throw new Error('Pedido não preparado.');
  };
  const started = new Promise<void>((resolve) => {
    signing = resolve;
  });
  const signature = new Promise<string>((resolve) => {
    complete = resolve;
  });
  const controller = new PublicProfiles(
    access(first, () => {
      signing();
      return signature;
    }),
  );
  controller.setSession(first);
  const fetch = t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json(result())),
  );
  const pending = controller.refresh();
  await started;
  controller.setSession(session());
  complete('assinatura-sintetica');
  await assert.rejects(pending, /Sessão alterada/);
  assert.equal(fetch.mock.callCount(), 0);
  const clean = new PublicProfiles(
    access(first, () => Promise.resolve('assinatura-sintetica')),
  );
  clean.setSession(first);
  fetch.mock.mockImplementation(() =>
    Promise.resolve(Response.json({ ...result(), accountId: first.accountId })),
  );
  await assert.rejects(clean.refresh(), /Campos inválidos/);
  assert.equal(clean.profile, null);
});

await test('atalho com foto pública não mistura iniciais; sem foto mantém fallback e a troca limpa os bytes', async (t) => {
  const { startOwnProfileShortcut } =
    await import('../src/client/public-profile/own-shortcut.ts');
  const { publicAvatarPath } =
    await import('../src/shared/public-media/index.ts');
  const { CommunityNode, communityDocument } =
    await import('./fixtures/community-dom.ts');
  const links = [new CommunityNode('a'), new CommunityNode('a')];
  for (const link of links) Object.assign(link, { isConnected: true });
  const document = Object.assign(communityDocument(), {
    querySelectorAll: () => links,
  });
  for (const [name, value] of Object.entries({
    document,
    window: new EventTarget(),
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const target = crypto.randomUUID();
  let avatar: string | null = publicAvatarPath(
    'avatar',
    target,
    crypto.randomUUID(),
  );
  const controller = new PublicProfiles(
    access(session(), () => Promise.resolve('assinatura-sintetica')),
  );
  controller.setSession(session());
  t.mock.method(controller, 'perform', () =>
    Promise.resolve({
      profile: { id: target, handle: 'teste_publico', avatar },
      revision: 1,
      pendingAvatar: null,
    }),
  );
  t.mock.method(globalThis, 'fetch', (_url: string, options: RequestInit) => {
    assert.equal(options.credentials, 'omit');
    return Promise.resolve(
      new Response(new Uint8Array([1]), {
        headers: { 'Content-Type': 'image/png', 'Content-Length': '1' },
      }),
    );
  });
  t.mock.method(URL, 'createObjectURL', () => 'blob:public-photo');
  const revoked: string[] = [];
  t.mock.method(URL, 'revokeObjectURL', (url: string) => revoked.push(url));
  const shortcut = startOwnProfileShortcut(controller);
  try {
    shortcut.ready();
    await new Promise<void>((resolve) => setImmediate(resolve));
    for (const link of links) {
      assert.equal(link.textContent, '');
      assert.ok(link.querySelector('img'));
      assert.equal(link.getAttribute('aria-label'), 'Open my public profile');
    }
    avatar = null;
    shortcut.clear();
    shortcut.ready();
    await new Promise<void>((resolve) => setImmediate(resolve));
    for (const link of links) {
      assert.equal(link.textContent, 'TE');
      assert.equal(link.querySelector('img'), null);
    }
    assert.equal(revoked.length, 2);
  } finally {
    shortcut.clear();
  }
});

await test('a prepared avatar replacement sends its original revision after a profile recheck', async (context) => {
  const own = session();
  const controller = new PublicProfiles(
    access(own, () => Promise.resolve('synthetic-signature')),
  );
  controller.setSession(own);
  controller.profile = { ...result(), revision: 8 };
  const revisions: unknown[] = [];
  context.mock.method(
    controller,
    'perform',
    (_operation: string, payload: Record<string, unknown>) => {
      revisions.push(payload['revision']);
      return Promise.resolve(result());
    },
  );
  await controller.avatar(null, 7);
  assert.deepEqual(revisions, [7]);
});
