import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { setImmediate as turn } from 'node:timers/promises';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';
import { observePublicPage } from '../src/client/public-traffic/index.ts';
import { postLinkSharing } from '../src/client/communities/post-link-sharing.ts';
import { setActiveLanguage, t } from '../src/shared/i18n/index.ts';
import type { CommunityPost } from '../src/shared/community-posts/index.ts';

function environment(context: TestContext) {
  const document = communityDocument();
  const window = new EventTarget();
  const clipboard = { writeText: () => Promise.resolve() };
  const data = new Map<string, string>();
  const globals = {
    document,
    window,
    location: { origin: 'http://127.0.0.1', hash: '#communities?view=feed' },
    navigator: { clipboard, share: () => Promise.resolve() },
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    context.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  context.after(() => {
    window.dispatchEvent(new Event('pagehide'));
    setActiveLanguage('en');
  });
  const collection = context.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(new Response(null, { status: 204 })),
  );
  return { document, window, clipboard, collection };
}

for (const status of [204, 503]) {
  await test(`public collection leaves page content unchanged with response ${status}`, async (context) => {
    const { collection } = environment(context);
    collection.mock.mockImplementation(() =>
      Promise.resolve(new Response(null, { status })),
    );
    context.mock.timers.enable({ apis: ['setTimeout'] });
    for (const language of ['en', 'zh-CN'] as const) {
      setActiveLanguage(language);
      const host = new CommunityNode();
      const content = new CommunityNode('article');
      content.textContent = 'Synthetic public content';
      host.append(content);
      const close = observePublicPage(
        '#communities?view=feed',
        host as unknown as HTMLElement,
      );
      try {
        assert.deepEqual(host.children, [content]);
        const before = collection.mock.callCount();
        context.mock.timers.tick(1000);
        context.mock.timers.tick(100);
        await turn();
        assert.ok(collection.mock.callCount() > before);
        assert.deepEqual(host.children, [content]);
        assert.equal(host.textContent, 'Synthetic public content');
      } finally {
        close();
      }
      assert.deepEqual(host.children, [content]);
    }
  });
}

await test('copy/share visible and accessibility states use both official languages', async (context) => {
  const { clipboard } = environment(context);
  const post: CommunityPost = {
    id: crypto.randomUUID(),
    community: crypto.randomUUID(),
    parent: null,
    root: null,
    status: 'visible',
    author: null,
    title: 'Synthetic post',
    text: 'Synthetic content',
    tags: [],
    createdAt: '2026-10-25T00:00:00.000Z',
    editedAt: null,
    revision: 1,
    score: 0,
    replies: 0,
  };
  for (const language of ['en', 'zh-CN'] as const) {
    setActiveLanguage(language);
    const toolbar = new CommunityNode();
    Object.defineProperty(toolbar, 'isConnected', { value: true });
    postLinkSharing(toolbar as unknown as HTMLElement, post);
    const buttons = toolbar.querySelectorAll('button');
    assert.deepEqual(
      buttons.map((button) => button.textContent),
      [t('Share link'), t('Copy link')],
    );
    const status = toolbar.children.find(
      (node) => node.getAttribute('role') === 'status',
    )!;
    buttons[1]!.click();
    await turn();
    assert.equal(status.textContent, t('Link copied.'));
    const fail = context.mock.method(clipboard, 'writeText', () =>
      Promise.reject(new Error('Synthetic clipboard denial.')),
    );
    buttons[1]!.click();
    await turn();
    assert.equal(status.textContent, t('Sharing is unavailable. Try again.'));
    fail.mock.restore();
    buttons[0]!.click();
    await turn();
    assert.equal(
      status.textContent,
      t('The browser received the sharing request.'),
    );
  }
});
