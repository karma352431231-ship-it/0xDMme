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
import { publicAvatarPath } from '../src/shared/public-media/index.ts';

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
        builder.onResolve(
          { filter: /^\.\.\/public-media\/index\.ts$/ },
          ({ importer }) => {
            if (
              importer.endsWith('/client/communities/index.ts') ||
              importer.endsWith('/client/communities/community-photos.ts')
            )
              return { path: 'community-photo', namespace: 'fixture' };
          },
        );
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents:
            path === 'community-photo'
              ? 'export const showPublicAvatar = fixturePhoto;'
              : 'export function startSocialDmUi() { return fixtureDms; }',
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
/** The sidebar also reads the person's created communities; these tests
 * follow the followed list, so that read gets a stable empty page. */
function ownedList(path: string, input?: RequestInit): boolean {
  if (!path.endsWith('/list') || typeof input?.body !== 'string') return false;
  const body = JSON.parse(input.body) as { payload: { kind?: unknown } };
  return body.payload.kind === 'owned';
}
function requestAfter(input?: RequestInit): string | null {
  const payload = input?.body;
  if (typeof payload !== 'string') throw new Error('Corpo JSON ausente.');
  const body = JSON.parse(payload) as { payload: { after: string | null } };
  return body.payload.after;
}
function fixture(
  options: {
    post?: boolean;
    creation?: boolean;
    directory?: boolean;
    management?: boolean;
    view?: string;
    photos?: boolean;
  } = {},
) {
  const state: CommunityState = {
    community: {
      id,
      name: 'Comunidade sintética',
      description: 'Description',
      rules: '',
      revision: 1,
      archived: false,
      avatar: options.photos
        ? publicAvatarPath('community-photo', id, crypto.randomUUID())
        : null,
      owner: null,
      followers: 1,
    },
    role: options.management ? 'owner' : 'participant',
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
    directory: {
      items: [] as CommunityState['community'][],
      next: null as string | null,
    },
    cursor: null as string | null,
    replies: [] as CommunityPost[],
    overrides: new Map<string, () => Promise<Response>>(),
    requests: [] as string[],
    listAfters: [] as (string | null)[],
    afters: [] as (string | null)[],
    payloads: [] as { path: string; payload: Record<string, unknown> }[],
    notifications: { items: [] as unknown[], next: null as string | null },
    dmMounts: [] as (string | null)[],
    dmLeaves: 0,
    dmDirectoryCurrent: null as (() => boolean) | null,
    navigations: [] as string[],
    photos: [] as {
      host: HTMLElement;
      signal: AbortSignal;
      cleaned: boolean;
    }[],
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
    ['list', data.directory],
    ['tags', { items: [], next: null }],
    ['followers-page', { items: [], total: 0, next: null }],
    ['post-notifications', data.notifications],
    ['post-upvote-notifications', { items: [], next: null }],
    ['post-notifications-read', {}],
    ['post-upvote-notifications-read', {}],
  ]);
  const respond = (path: string, input?: RequestInit) => {
    if (path.endsWith('/state'))
      return Promise.resolve(
        Response.json(data.failState ? { error: 'Not authorized.' } : state, {
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
  const document = communityDocument();
  const createElement = document.createElement;
  document.createElement = (tag: string) =>
    Object.assign(createElement(tag), {
      showModal() {},
      close() {},
      replaceWith(this: CommunityNode, replacement: CommunityNode) {
        const parent = this.parent;
        if (!parent) return;
        replacement.remove();
        parent.children.splice(parent.children.indexOf(this), 1, replacement);
        replacement.parent = parent;
        this.parent = null;
      },
    });
  const context: Record<string, unknown> = {
    fixturePhoto: (host: HTMLElement, input: { signal: AbortSignal }) => {
      const photo = { host, signal: input.signal, cleaned: false };
      data.photos.push(photo);
      const cleanup = () => {
        photo.cleaned = true;
        input.signal.removeEventListener('abort', cleanup);
      };
      input.signal.addEventListener('abort', cleanup, { once: true });
      return cleanup;
    },
    fixtureDms: {
      setSession() {},
      ready() {},
      canActivate: () => true,
      leave: () => {
        data.dmLeaves++;
      },
      mount: (_host: HTMLElement, id: string | null) => {
        data.dmMounts.push(id);
      },
      directory: (_host: HTMLElement, current: () => boolean) => {
        data.dmDirectoryCurrent = current;
        return Promise.resolve();
      },
    },
    document,
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
      if (typeof input?.body === 'string') {
        const body = JSON.parse(input.body) as {
          payload: Record<string, unknown>;
        };
        data.payloads.push({ path, payload: body.payload });
      }
      if (ownedList(path, input))
        return Promise.resolve(Response.json({ items: [], next: null }));
      if (path.endsWith('/list')) data.listAfters.push(requestAfter(input));
      const override = data.overrides.get(path);
      return override ? override() : respond(path, input);
    },
    location: { hash: '' },
    history: {
      pushState: (_state: unknown, _title: string, href: string) => {
        data.navigations.push(href);
      },
    },
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
      publicProfile: () => Promise.resolve(true),
      profiles: {
        inspect: () => Promise.resolve(null),
        set: () =>
          Promise.resolve({ following: false, notify: false, revision: 0 }),
      },
    },
  );
  const host = new CommunityNode('main');
  const sidebar = options.directory ? new CommunityNode('aside') : null;
  ui.setSession(account);
  ui.mount(
    host as unknown as HTMLElement,
    sidebar as unknown as HTMLElement | null,
    new URLSearchParams(
      options.view
        ? { view: options.view }
        : options.creation
          ? { view: 'create' }
          : {
              id,
              ...(options.post ? { post: postId } : {}),
              ...(options.management ? { view: 'manage' } : {}),
            },
    ),
  );
  return { ui, host, sidebar, data };
}

await test('same-session recheck preserves community, card and draft while querying current data', async () => {
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
await test('identical post and replies preserve elements; edits and deletions stay current', async () => {
  const { ui, host, data } = fixture({ post: true });
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
  data.value = { ...data.value, title: 'Edited', revision: 2 };
  ui.ready();
  await settled(ui);
  assert.match(host.textContent, /Edited/);
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
await test('permission change publishes one updated screen; failure discards content and allows rechecking', async () => {
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
await test('recheck preserves the displayed page cursor instead of advancing to the next page', async () => {
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

await test('private list is discarded before checking and returning to public cannot reuse its view', async () => {
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
await test('late community response cannot restore the screen after navigation', async () => {
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
await test('invalid post response discards the previous view and a subsequent check may restore it', async () => {
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

await test('recheck invalidates an in-flight private list before publishing its result', async () => {
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

await test('rechecks preserve the community creation name, description and rules', async () => {
  const { ui, host, data } = fixture({ creation: true, directory: true });
  await settled(ui);
  const form = host.querySelector('.community-create-fields');
  assert.ok(form, host.textContent);
  const fields = form
    .querySelectorAll('input,textarea')
    .filter((field) => field.type !== 'checkbox');
  assert.equal(fields.length, 3);
  const draft = ['Nome em edição', 'Descrição em edição', 'Regras em edição'];
  fields.forEach((field, index) => {
    field.value = draft[index] ?? '';
  });
  const replacements = host.replacements;
  const reads = data.requests.length;
  ui.setSession({ ...account });
  ui.ready();
  await settled(ui);
  assert.equal(host.querySelector('.community-create-fields'), form);
  assert.equal(host.replacements, replacements);
  assert.deepEqual(
    fields.map((field) => field.value),
    draft,
  );
  assert.ok(data.requests.length > reads, 'rechecks still read the server');
  ui.leave();
});

await test('sidebar rechecks retain identical nodes while awaiting the network', async () => {
  const { ui, sidebar, data } = fixture({ directory: true });
  await settled(ui);
  assert.ok(sidebar);
  const head = sidebar.querySelector('.community-directory-head');
  const replacements = sidebar.replacements;
  const gate = deferred<Response>(),
    started = deferred<void>();
  data.overrides.set('/api/account/communities/list', () => {
    started.resolve(undefined);
    return gate.promise;
  });
  ui.ready();
  await started.promise;
  try {
    assert.equal(sidebar.querySelector('.community-directory-head'), head);
    assert.equal(sidebar.replacements, replacements);
  } finally {
    gate.resolve(Response.json(data.directory));
    await settled(ui);
    ui.leave();
  }
  assert.equal(sidebar.querySelector('.community-directory-head'), head);
  assert.equal(sidebar.replacements, replacements);
});

await test('the sidebar applies changes and discards previous data on authorization failure', async () => {
  const { ui, sidebar, data } = fixture({ directory: true });
  await settled(ui);
  assert.ok(sidebar);
  data.directory.items = [data.state.community];
  ui.ready();
  await settled(ui);
  assert.ok(sidebar.textContent.includes(data.state.community.name));
  const row = sidebar.querySelector('.community-row');
  ui.ready();
  await settled(ui);
  assert.equal(sidebar.querySelector('.community-row'), row);
  data.overrides.set('/api/account/communities/list', () =>
    Promise.resolve(
      Response.json({ error: 'Not authorized.' }, { status: 403 }),
    ),
  );
  ui.ready();
  await settled(ui);
  assert.equal(sidebar.querySelector('.community-row'), null);
  assert.match(sidebar.textContent, /Not authorized/);
  data.overrides.clear();
  ui.ready();
  await settled(ui);
  assert.ok(sidebar.querySelector('.community-row'));
  ui.leave();
});

await test('the sidebar advances only explicitly and rechecks the displayed page', async () => {
  const { ui, sidebar, data } = fixture({ directory: true });
  data.directory.next = crypto.randomUUID();
  await settled(ui);
  assert.ok(sidebar);
  const more = sidebar
    .querySelectorAll('button')
    .find((button) => button.textContent === 'More communities');
  assert.ok(more, sidebar.textContent);
  more.click();
  await setImmediate();
  await settled(ui);
  ui.ready();
  await settled(ui);
  assert.deepEqual(data.listAfters, [
    null,
    data.directory.next,
    data.directory.next,
  ]);
  ui.leave();
});

await test('session changes discard the old form and a late sidebar response cannot restore it', async () => {
  const { ui, host, sidebar, data } = fixture({
    creation: true,
    directory: true,
  });
  await settled(ui);
  const form = host.querySelector('.community-create-fields');
  assert.ok(form);
  const field = form.querySelector('input');
  assert.ok(field);
  field.value = 'Draft from the previous account';
  const gate = deferred<Response>(),
    started = deferred<void>();
  data.overrides.set('/api/account/communities/list', () => {
    started.resolve(undefined);
    return gate.promise;
  });
  ui.ready();
  await started.promise;
  ui.setSession(null);
  gate.resolve(Response.json(data.directory));
  await settled(ui);
  assert.notEqual(host.querySelector('.community-create-fields'), form);
  assert.equal(host.querySelector('.community-create-fields'), null);
  assert.ok(host.querySelector('.public-action-invitation'));
  assert.ok(!host.textContent.includes('Draft from the previous account'));
  assert.equal(sidebar?.querySelector('.community-row'), null);
  ui.leave();
});

await test('automatic reads keep creation fields editable while awaiting the list', async () => {
  const { ui, host, data } = fixture({ creation: true, directory: true });
  await settled(ui);
  const field = host
    .querySelector('.community-create-fields')
    ?.querySelector('input');
  assert.ok(field);
  const gate = deferred<Response>(),
    started = deferred<void>();
  data.overrides.set('/api/account/communities/list', () => {
    started.resolve(undefined);
    return gate.promise;
  });
  ui.ready();
  await started.promise;
  try {
    assert.equal(field.disabled, false);
    field.value = 'Texto durante a consulta';
  } finally {
    gate.resolve(Response.json(data.directory));
    await settled(ui);
    ui.leave();
  }
  assert.equal(field.value, 'Texto durante a consulta');
});

function chooseCreationTopic(host: CommunityNode): void {
  const topic = host
    .querySelector('.community-topic-picker')
    ?.querySelector('input');
  assert.ok(topic);
  topic.checked = true;
  topic.dispatchEvent(new Event('change'));
}

await test('creation submitted during an automatic sidebar read runs once after the read', async () => {
  const { ui, host, data } = fixture({ creation: true, directory: true });
  await settled(ui);
  const gate = deferred<Response>(),
    started = deferred<void>();
  const create = '/api/account/communities/create';
  data.overrides.set('/api/account/communities/list', () => {
    started.resolve(undefined);
    return gate.promise;
  });
  data.overrides.set(create, () => Promise.resolve(Response.json(data.state)));
  ui.ready();
  await started.promise;
  chooseCreationTopic(host);
  const submit = host.querySelector('.community-create-submit');
  assert.ok(submit, host.textContent);
  assert.equal(submit.disabled, false);
  submit.click();
  submit.click();
  await setImmediate();
  assert.ok(!data.requests.includes(create));
  gate.resolve(Response.json(data.directory));
  await settled(ui);
  assert.equal(data.requests.filter((path) => path === create).length, 1);
  ui.leave();
});

for (const change of ['session', 'navigation'] as const) {
  await test(`a ${change} change discards a creation action waiting for an automatic read`, async () => {
    const { ui, host, data } = fixture({ creation: true, directory: true });
    await settled(ui);
    const gate = deferred<Response>(),
      started = deferred<void>();
    const create = '/api/account/communities/create';
    data.overrides.set('/api/account/communities/list', () => {
      started.resolve(undefined);
      return gate.promise;
    });
    data.overrides.set(create, () =>
      Promise.resolve(Response.json(data.state)),
    );
    ui.ready();
    await started.promise;
    chooseCreationTopic(host);
    const submit = host.querySelector('.community-create-submit');
    assert.ok(submit);
    submit.click();
    if (change === 'session') ui.setSession(null);
    else ui.leave();
    gate.resolve(Response.json(data.directory));
    await settled(ui);
    assert.ok(!data.requests.includes(create));
    ui.leave();
  });
}

await test('management rechecks keep image pickers and typed presentation fields mounted', async () => {
  const { ui, host, data } = fixture({ management: true });
  await settled(ui);
  const form = host.querySelector('.community-presentation-editor');
  assert.ok(form);
  const fields = form
    .querySelectorAll('input,textarea')
    .filter((field) => field.type !== 'file');
  fields[0]!.value = 'Unsaved replacement name';
  // The minimal DOM fixture does not bubble events from child controls.
  form.dispatchEvent(new Event('input'));
  const pickers = form.querySelectorAll('.community-image-pick');
  const replacements = host.replacements;
  const reads = data.requests.length;
  ui.ready();
  await setImmediate();
  await setImmediate();
  assert.equal(host.querySelector('.community-presentation-editor'), form);
  assert.deepEqual(form.querySelectorAll('.community-image-pick'), pickers);
  assert.equal(fields[0]!.value, 'Unsaved replacement name');
  assert.equal(host.replacements, replacements);
  assert.ok(data.requests.length > reads, 'permissions are still read');
  data.state.community.revision++;
  ui.ready();
  await setImmediate();
  await setImmediate();
  assert.equal(host.querySelector('.community-presentation-editor'), form);
  assert.equal(fields[0]!.value, 'Unsaved replacement name');
  data.state.role = 'participant';
  ui.ready();
  await settled(ui);
  assert.equal(host.querySelector('.community-presentation-editor'), null);
  data.failState = true;
  ui.ready();
  await setImmediate();
  await setImmediate();
  assert.equal(host.querySelector('.community-presentation-editor'), null);
  ui.leave();
});

await test('leaving the communities page keeps a workspace-owned DM open and closes only page-owned DMs', async () => {
  const f = fixture();
  await settled(f.ui);
  f.ui.openDm(
    new CommunityNode('section') as unknown as HTMLElement,
    id,
    false,
  );
  f.ui.leave();
  assert.equal(f.data.dmLeaves, 0);
  f.ui.closeDm();
  assert.equal(f.data.dmLeaves, 1);
  f.ui.closeDm();
  assert.equal(f.data.dmLeaves, 1);
  f.ui.mount(
    f.host as unknown as HTMLElement,
    null,
    new URLSearchParams({ view: 'dms', dm: id }),
  );
  await settled(f.ui);
  assert.deepEqual(f.data.dmMounts, [id, id]);
  f.ui.leave();
  assert.equal(f.data.dmLeaves, 2);
});

await test('DM directory requests become obsolete when the communities page leaves', async () => {
  const f = fixture({ view: 'dms', directory: true });
  await settled(f.ui);
  const current = f.data.dmDirectoryCurrent;
  assert.ok(current);
  assert.equal(current(), true);
  f.ui.leave();
  assert.equal(current(), false);
});

await test('notification pagination and reload retain their read acknowledgement payloads', async () => {
  const f = fixture({ view: 'replies' });
  f.data.notifications.items = [
    {
      reply: postId,
      post: postId,
      community: id,
      kind: 'post',
      createdAt: '2026-10-24T10:00:00.000Z',
      read: false,
      preview: null,
    },
  ];
  f.data.notifications.next = `2026-10-24T10:00:00.000Z/${postId}`;
  await settled(f.ui);
  assert.match(f.host.textContent, /New publication/);
  const earlier = f.host
    .querySelectorAll('button')
    .find((node) => node.textContent === 'Earlier notifications');
  assert.ok(earlier);
  earlier.click();
  await setImmediate();
  await settled(f.ui);
  const reload = f.host
    .querySelectorAll('button')
    .find((node) => node.textContent === 'Reload notifications');
  assert.ok(reload);
  reload.click();
  await setImmediate();
  await settled(f.ui);
  const path = '/api/account/communities/post-notifications';
  assert.deepEqual(
    f.data.payloads
      .filter((row) => row.path === path)
      .map((row) => row.payload.after),
    [null, f.data.notifications.next, null],
  );
  const inbox = await f.ui.publicationNotifications();
  assert.equal(inbox[0]?.reply, postId);
  assert.deepEqual(
    f.data.payloads.filter((row) => row.path === path).at(-1)?.payload,
    { after: null, authors: true },
  );
  await f.ui.markRepliesRead([postId]);
  await f.ui.markUpvotesRead([postId]);
  assert.deepEqual(f.data.payloads.at(-2)?.payload, { replies: [postId] });
  assert.deepEqual(f.data.payloads.at(-1)?.payload, { ids: [postId] });
  f.ui.leave();
});

await test('a late notification page cannot replace the next screen', async () => {
  const f = fixture({ view: 'replies' });
  await settled(f.ui);
  const response = deferred<Response>(),
    started = deferred<void>();
  f.data.overrides.set('/api/account/communities/post-notifications', () => {
    started.resolve(undefined);
    return response.promise;
  });
  f.ui.ready();
  await started.promise;
  f.ui.leave();
  f.host.replaceChildren();
  response.resolve(Response.json(f.data.notifications));
  await settled(f.ui);
  assert.equal(f.host.children.length, 0);
});

await test('a creation confirmed after navigation does not navigate away from the new page', async () => {
  const f = fixture({ creation: true });
  await settled(f.ui);
  const response = deferred<Response>(),
    started = deferred<void>();
  f.data.overrides.set('/api/account/communities/create', () => {
    started.resolve(undefined);
    return response.promise;
  });
  chooseCreationTopic(f.host);
  f.host.querySelector('.community-create-submit')!.click();
  await started.promise;
  f.ui.leave();
  response.resolve(Response.json(f.data.state));
  await settled(f.ui);
  assert.deepEqual(f.data.navigations, []);
});

await test('personal community lists advance explicitly and reset their page on remount', async () => {
  const f = fixture({ view: 'communities' });
  f.data.directory.items = [f.data.state.community];
  f.data.directory.next = crypto.randomUUID();
  await settled(f.ui);
  assert.match(f.host.textContent, /My communities/);
  const next = f.host
    .querySelectorAll('button')
    .find((node) => node.textContent === 'Next page');
  assert.ok(next);
  next.click();
  await setImmediate();
  await settled(f.ui);
  f.ui.mount(
    f.host as unknown as HTMLElement,
    null,
    new URLSearchParams({ view: 'invitations' }),
  );
  await settled(f.ui);
  assert.match(f.host.textContent, /Community transfers/);
  assert.deepEqual(f.data.listAfters, [null, f.data.directory.next, null]);
  f.ui.leave();
});

await test('community and sidebar photos are retained on unchanged reads and released together on departure', async () => {
  const f = fixture({ directory: true, photos: true });
  f.data.directory.items = [f.data.state.community];
  await settled(f.ui);
  assert.equal(f.data.photos.length, 2);
  assert.ok(f.data.photos.every((photo) => !photo.cleaned));
  f.ui.ready();
  await settled(f.ui);
  assert.equal(f.data.photos.length, 2);
  assert.ok(f.data.photos.every((photo) => !photo.cleaned));
  f.ui.leave();
  assert.ok(f.data.photos.every((photo) => photo.cleaned));
  assert.ok(f.data.photos.every((photo) => photo.signal.aborted));
});

await test('saving community presentation accepts the revision without remounting its editor', async () => {
  const f = fixture({ management: true });
  await settled(f.ui);
  const form = f.host.querySelector('.community-presentation-editor')!;
  const name = form.querySelector('input')!;
  name.value = 'Confirmed replacement name';
  form.dispatchEvent(new Event('input'));
  const path = '/api/account/communities/presentation';
  f.data.overrides.set(path, () =>
    Promise.resolve(
      Response.json({
        ...f.data.state,
        community: { ...f.data.state.community, name: name.value, revision: 2 },
      }),
    ),
  );
  const confirm = form
    .querySelectorAll('button')
    .find((button) => button.textContent === 'Confirm changes')!;
  confirm.click();
  await setImmediate();
  await settled(f.ui);
  assert.equal(f.host.querySelector('.community-presentation-editor'), form);
  assert.match(
    f.host.querySelector('.community-post-back')!.textContent,
    /Confirmed replacement name/,
  );
  assert.equal(
    f.data.payloads.find((row) => row.path === path)?.payload.revision,
    1,
  );
  assert.equal(name.value, 'Confirmed replacement name');
  f.ui.leave();
});
