import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';

await test('trocar perfil por comunidade não cancela a próxima prévia com o timeout antigo', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const document = communityDocument(),
    body = new CommunityNode('body'),
    window = new EventTarget();
  Object.assign(document, { body });
  const create = document.createElement;
  document.createElement = (tag) =>
    Object.assign(create(tag), {
      style: {},
      offsetWidth: 300,
      offsetHeight: 100,
    });
  Object.assign(window, {
    setTimeout: globalThis.setTimeout,
    innerWidth: 1200,
    innerHeight: 800,
  });
  const globals = {
    document,
    window,
    Element: CommunityNode,
    Node: CommunityNode,
  };
  const saved = Object.keys(globals).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  const link = (label: string) =>
    Object.assign(new CommunityNode('a'), {
      closest() {
        return this;
      },
      getBoundingClientRect() {
        return { top: 20, bottom: 40, left: 20 };
      },
      label,
    });
  const profile = link('perfil'),
    community = link('comunidade');
  const over = (target: CommunityNode): void => {
    const event = new Event('pointerover');
    Object.defineProperties(event, {
      target: { value: target },
      pointerType: { value: 'mouse' },
    });
    document.dispatchEvent(event);
  };
  try {
    const { registerHoverCard } =
      await import('../src/client/hover-card/index.ts');
    registerHoverCard((source) => (card) => {
      card.textContent = (source as unknown as typeof profile).label;
      return Promise.resolve();
    });
    over(profile);
    t.mock.timers.tick(450);
    await Promise.resolve();
    assert.equal(body.textContent, 'perfil');
    profile.dispatchEvent(new Event('pointerleave'));
    over(community);
    t.mock.timers.tick(450);
    await Promise.resolve();
    assert.equal(body.textContent, 'comunidade');
  } finally {
    window.dispatchEvent(new Event('hashchange'));
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

await test('prévia de menção por UUID mantém identidade estável e recusa @ reutilizado', async (t) => {
  const { profileHoverProvider } =
    await import('../src/client/public-profile/profile-hover.ts');
  const document = communityDocument();
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
  });
  const id = crypto.randomUUID(),
    removed = crypto.randomUUID();
  const profile = { id, handle: 'pessoa', avatar: null };
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', (input: string | URL | Request) => {
    const path =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    requests.push(path);
    return Promise.resolve(
      Response.json(
        path.includes('/id/')
          ? profile
          : {
              profile,
              description: '',
              banner: null,
              createdAt: null,
              conversations: 0,
              posts: 0,
              replies: 0,
              communities: 0,
              followers: 1,
            },
      ),
    );
  });
  const provider = profileHoverProvider({
    hasSession: () => false,
  } as unknown as import('../src/client/public-profile/controller.ts').PublicProfiles);
  const link = (target: string) => {
    const node = new CommunityNode('a');
    node.setAttribute('href', `#users?id=${target}`);
    return node as unknown as HTMLAnchorElement;
  };
  try {
    const card = new CommunityNode('div');
    await provider(link(id))!(
      card as unknown as HTMLElement,
      new AbortController().signal,
    );
    assert.deepEqual(requests, [
      `/api/public-profiles/id/${id}`,
      '/api/public-profiles/pessoa/page',
    ]);
    assert.equal(
      card.children.find((node) => node.className === 'hover-card-title') &&
        (
          card.children.find(
            (node) => node.className === 'hover-card-title',
          ) as unknown as HTMLAnchorElement
        ).href,
      `#users?id=${id}`,
    );
    await assert.rejects(
      provider(link(removed))!(
        card as unknown as HTMLElement,
        new AbortController().signal,
      ),
      /Perfil público alterado/,
    );
    assert.equal(provider(link('invalid')), null);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
