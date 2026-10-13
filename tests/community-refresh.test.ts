import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { AccountSession } from '../src/shared/account/index.ts';
import type { CommunityState } from '../src/shared/communities/index.ts';
import type { CommunityPost } from '../src/shared/community-posts/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import type { startCommunities } from '../src/client/communities/index.ts';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';

const bundle = await build({
  entryPoints: ['src/client/communities/index.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'communityUi',
  // Public @ DMs are a separate feature with their own lifecycle/tests.
  plugins: [
    {
      name: 'separate-dm-feature',
      setup(builder) {
        builder.onResolve({ filter: /^\.\/dms\.ts$/ }, () => ({
          path: 'dms',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents:
            'export function startSocialDmUi() { return { setSession() {}, leave() {}, canActivate() { return true; } }; }',
          loader: 'js',
        }));
      },
    },
  ],
  define: {
    'import.meta.url': '"https://0xdmme.app/fixture.js"',
    EMOJI_ASSET_URL: '"/unused"',
    VOICE_WORKLET_URL: '"/unused"',
    ATTACHMENT_WORKER_URL: '"/unused"',
  },
});
const source = bundle.outputFiles[0]?.text ?? '';
if (!source) throw new Error('Bundle de teste ausente.');
const id = crypto.randomUUID(),
  postId = crypto.randomUUID();
const account: AccountSession = {
  accountId: crypto.randomUUID(),
  deviceId: crypto.randomUUID(),
  csrf: 'a'.repeat(64),
  name: 'Sintético',
  address: `0x${'1'.repeat(40)}`,
  ecosystem: 'evm',
  deviceState: 'pending',
  historyAuthorized: false,
  expiresAt: '2027-01-01T00:00:00.000Z',
  profileRevision: 1,
  walletConfirmed: true,
};
async function settled(ui: ReturnType<typeof startCommunities>): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!ui.canActivate()) {
    if (Date.now() > deadline)
      throw new Error('UI não concluiu a atualização.');
    await setImmediate();
  }
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Promise não preparada.');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function requestAfter(input?: RequestInit): string | null {
  const payload = input?.body;
  if (typeof payload !== 'string') throw new Error('Corpo JSON ausente.');
  const body = JSON.parse(payload) as { payload: { after: string | null } };
  return body.payload.after;
}
function fixture(post = false) {
  const state: CommunityState = {
    community: {
      id,
      name: 'Comunidade sintética',
      description: 'Descrição',
      rules: '',
      revision: 1,
      archived: false,
      avatar: null,
      owner: null,
      followers: 1,
    },
    role: 'participant',
    following: true,
    canPost: true,
    pendingPhoto: null,
    sanction: null,
    transfer: null,
  };
  const value: CommunityPost = {
    id: postId,
    community: id,
    author: null,
    title: 'Postagem sintética',
    text: 'Texto público',
    tags: [],
    createdAt: '2026-10-11T12:00:00.000Z',
    editedAt: null,
    revision: 1,
    status: 'visible',
    parent: null,
    root: null,
    score: 0,
    replies: 0,
  };
  const data = {
    state,
    value,
    failState: false,
    cursor: null as string | null,
    replies: [] as CommunityPost[],
    overrides: new Map<string, () => Promise<Response>>(),
    requests: [] as string[],
    afters: [] as (string | null)[],
  };
  const authority: VaultAuthority = {
    session: account,
    offline: false,
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    sign: () => Promise.resolve('assinatura-sintética'),
    key: () => Promise.reject(new Error('Sem chave de conteúdo.')),
  };
  const access: VaultAccess = {
    withVault: (_offline, work) => work(authority),
    withLocalVault: (_locator, work) => work(authority),
  };
  const emptyPages = new Map<string, unknown>([
    ['tags', { items: [], next: null }],
    ['followers-page', { items: [], total: 0, next: null }],
  ]);
  const respond = (path: string, input?: RequestInit) => {
    if (path.endsWith('/state'))
      return Promise.resolve(
        Response.json(data.failState ? { error: 'Sem autorização.' } : state, {
          status: data.failState ? 403 : 200,
        }),
      );
    const page = emptyPages.get(path.slice(path.lastIndexOf('/') + 1));
    if (page) return Promise.resolve(Response.json(page));
    if (['/replies', '/post-replies'].some((suffix) => path.endsWith(suffix)))
      return Promise.resolve(
        Response.json({ items: data.replies, next: null }),
      );
    if (
      ['/posts/' + postId, '/post-public'].some((suffix) =>
        path.endsWith(suffix),
      )
    )
      return Promise.resolve(Response.json(data.value));
    if (path.endsWith('/post-page'))
      return Promise.resolve(
        Response.json({
          items: [
            {
              post: {
                ...data.value,
                title: 'Lista privada',
                id: crypto.randomUUID(),
              },
              own: true,
              manager: false,
              canEdit: true,
              canDelete: true,
              content: null,
              removal: null,
              vote: { position: 0, revision: 0 },
            },
          ],
          next: null,
        }),
      );
    if (path.endsWith('/discovery-feed')) {
      data.afters.push(requestAfter(input));
      return Promise.resolve(
        Response.json({
          items: [
            { post: data.value, community: { id, name: state.community.name } },
          ],
          next: data.cursor,
        }),
      );
    }
    if (path === '/api/communities/' + id)
      return Promise.resolve(Response.json(state.community));
    throw new Error('Requisição inesperada: ' + path);
  };
  const context: Record<string, unknown> = {
    document: communityDocument(),
    window: new EventTarget(),
    HTMLElement: CommunityNode,
    HTMLAnchorElement: CommunityNode,
    HTMLButtonElement: CommunityNode,
    HTMLInputElement: CommunityNode,
    HTMLLabelElement: CommunityNode,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    Response,
    TextEncoder,
    TextDecoder,
    Error,
    Event,
    crypto,
    performance,
    setTimeout,
    clearTimeout,
    fetch: (path: string, input?: RequestInit) => {
      data.requests.push(path);
      const override = data.overrides.get(path);
      return override ? override() : respond(path, input);
    },
    location: { hash: '' },
  };
  runInNewContext(source, context);
  const exported = context['communityUi'] as {
    startCommunities: typeof startCommunities;
  };
  const start = exported.startCommunities;
  assert.ok(start);
  const ui = start(
    access,
    {} as Parameters<typeof startCommunities>[1],
    {} as Parameters<typeof startCommunities>[2],
    {
      inspect: () => Promise.resolve(null),
      set: () =>
        Promise.resolve({ following: false, notify: false, revision: 0 }),
    },
  );
  const host = new CommunityNode('main');
  ui.setSession(account);
  ui.mount(
    host as unknown as HTMLElement,
    null,
    new URLSearchParams({ id, ...(post ? { post: postId } : {}) }),
  );
  return { ui, host, data };
}

await test('rechecagem da mesma sessão conserva comunidade, cartão e rascunho, consultando dados atuais', async () => {
  const { ui, host, data } = fixture();
  await settled(ui);
  const hero = host.querySelector('.community-hero'),
    card = host.querySelector('.community-post'),
    draft = host.querySelector('textarea');
  assert.ok(hero, host.textContent);
  assert.ok(card, host.textContent);
  assert.ok(draft);
  draft.value = 'Rascunho preservado';
  const replacements = host.replacements,
    reads = data.requests.length;
  ui.setSession({ ...account });
  ui.ready();
  await settled(ui);
  assert.equal(host.replacements, replacements);
  assert.equal(host.querySelector('.community-hero'), hero);
  assert.equal(host.querySelector('.community-post'), card);
  assert.equal(host.querySelector('textarea'), draft);
  assert.equal(draft.value, 'Rascunho preservado');
  assert.ok(data.requests.length > reads);
  ui.leave();
});
await test('post e respostas idênticos conservam elementos; edição e exclusão continuam atuais', async () => {
  const { ui, host, data } = fixture(true);
  await settled(ui);
  const card = host.querySelector('.community-post'),
    thread = host.querySelector('.community-thread');
  assert.ok(card, host.textContent);
  assert.ok(thread, host.textContent);
  assert.ok(data.requests.includes('/api/account/communities/post-public'));
  assert.ok(data.requests.includes('/api/account/communities/post-replies'));
  ui.ready();
  await settled(ui);
  assert.equal(host.querySelector('.community-post'), card);
  assert.equal(host.querySelector('.community-thread'), thread);
  data.value = { ...data.value, title: 'Editada', revision: 2 };
  ui.ready();
  await settled(ui);
  assert.match(host.textContent, /Editada/);
  assert.notEqual(host.querySelector('.community-post'), card);
  data.value = {
    ...data.value,
    status: 'deleted',
    title: '',
    text: '',
    revision: 3,
  };
  ui.ready();
  await settled(ui);
  assert.doesNotMatch(host.textContent, /Texto público|Editada/);
  assert.match(host.textContent, /deleted by the author/);
  ui.leave();
});
await test('mudança de permissão publica uma única tela atualizada; falha descarta conteúdo e permite nova conferência', async () => {
  const { ui, host, data } = fixture();
  await settled(ui);
  const replacements = host.replacements;
  data.state.canPost = false;
  ui.ready();
  await settled(ui);
  assert.equal(host.replacements, replacements + 1);
  assert.equal(host.querySelector('.post-composer'), null);
  data.failState = true;
  ui.ready();
  await settled(ui);
  assert.equal(host.querySelector('.community-post'), null);
  assert.match(host.textContent, /Not authorized/);
  data.failState = false;
  ui.ready();
  await settled(ui);
  assert.ok(host.querySelector('.community-post'));
  ui.leave();
});
await test('rechecagem conserva o cursor da página exibida em vez de avançar para a próxima', async () => {
  const { ui, host, data } = fixture();
  const cursor = JSON.stringify({
    filter: 'fixture',
    anchor: '2026-10-11T12:00:00.000Z',
    rank: 0,
    time: data.value.createdAt,
    id: data.value.id,
  });
  data.cursor = cursor;
  await settled(ui);
  ui.ready();
  await settled(ui);
  assert.deepEqual(data.afters, [null, null]);
  const more = host
    .querySelectorAll('button')
    .find((node) => node.textContent === 'Earlier posts');
  assert.ok(more);
  more.click();
  await setImmediate();
  await settled(ui);
  ui.ready();
  await settled(ui);
  assert.deepEqual(data.afters, [null, null, cursor, cursor]);
  ui.leave();
});

await test('lista privada é descartada antes da conferência e voltar ao público não reutiliza sua visão', async () => {
  const { ui, host, data } = fixture();
  await settled(ui);
  const own = host
    .querySelectorAll('button')
    .find((node) => node.value === 'own');
  assert.ok(own);
  own.click();
  await setImmediate();
  await settled(ui);
  assert.match(host.textContent, /Lista privada/);
  const gate = deferred<Response>();
  data.overrides.set('/api/account/communities/state', () => gate.promise);
  ui.ready();
  assert.doesNotMatch(host.textContent, /Lista privada/);
  gate.resolve(Response.json(data.state));
  await settled(ui);
  const recent = host
    .querySelectorAll('button')
    .find((node) => node.value === 'recent');
  assert.ok(recent);
  recent.click();
  await setImmediate();
  await settled(ui);
  assert.match(host.textContent, /Postagem sintética/);
  assert.doesNotMatch(host.textContent, /Lista privada/);
  ui.leave();
});
await test('resposta atrasada da comunidade não restaura a tela depois da navegação', async () => {
  const { ui, host, data } = fixture();
  await settled(ui);
  const gate = deferred<Response>(),
    started = deferred<void>();
  data.overrides.set('/api/account/communities/state', () => {
    started.resolve(undefined);
    return gate.promise;
  });
  ui.ready();
  await started.promise;
  ui.leave();
  host.replaceChildren();
  gate.resolve(Response.json(data.state));
  await settled(ui);
  assert.equal(host.children.length, 0);
});
await test('resposta inválida de posts descarta a visão anterior e a próxima conferência pode restaurá-la', async () => {
  const { ui, host, data } = fixture();
  await settled(ui);
  data.overrides.set('/api/account/communities/discovery-feed', () =>
    Promise.resolve(Response.json({ items: [{ private: true }], next: null })),
  );
  ui.ready();
  await settled(ui);
  assert.equal(host.querySelector('.community-post'), null);
  data.overrides.clear();
  ui.ready();
  await settled(ui);
  assert.ok(host.querySelector('.community-post'));
  ui.leave();
});

await test('rechecagem invalida uma lista privada ainda em voo antes de publicar seu resultado', async () => {
  const { ui, host, data } = fixture();
  await settled(ui);
  const privateResponse = deferred<Response>(),
    privateStarted = deferred<void>(),
    stateResponse = deferred<Response>();
  data.overrides.set('/api/account/communities/post-page', () => {
    privateStarted.resolve(undefined);
    return privateResponse.promise;
  });
  const own = host
    .querySelectorAll('button')
    .find((node) => node.value === 'own');
  assert.ok(own);
  own.click();
  await privateStarted.promise;
  data.overrides.set(
    '/api/account/communities/state',
    () => stateResponse.promise,
  );
  ui.ready();
  privateResponse.resolve(
    Response.json({
      items: [
        {
          post: { ...data.value, title: 'Resposta privada antiga' },
          own: true,
          manager: false,
          canEdit: true,
          canDelete: true,
          content: null,
          removal: null,
          vote: { position: 0, revision: 0 },
        },
      ],
      next: null,
    }),
  );
  await setImmediate();
  assert.doesNotMatch(host.textContent, /Resposta privada antiga/);
  data.overrides.delete('/api/account/communities/post-page');
  stateResponse.resolve(Response.json(data.state));
  await settled(ui);
  assert.match(host.textContent, /Lista privada/);
  assert.doesNotMatch(host.textContent, /Resposta privada antiga/);
  ui.leave();
});
