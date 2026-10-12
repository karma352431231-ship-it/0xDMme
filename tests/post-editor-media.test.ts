import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postEditorMedia } from '../src/client/communities/post-editor-media.ts';
import { GifSearch } from '../src/client/gif-search/index.ts';
import type { ExternalMediaConsent } from '../src/client/external-media/index.ts';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';

await test('selecionar GIF em post/reply muda apenas o rascunho, sem publicar ou carregar terceiros antes do toque', async (t) => {
  const document = communityDocument(),
    create = document.createElement;
  const query = (
    host: CommunityNode,
    selector: string,
  ): CommunityNode | null => {
    if (!selector.startsWith('['))
      return CommunityNode.prototype.querySelector.call(host, selector);
    const name = selector.slice(1, -1);
    return (
      host.children
        .flatMap((node) => [node, ...descendants(node)])
        .find((node) => node.getAttribute(name) !== null) ?? null
    );
  };
  function descendants(node: CommunityNode): CommunityNode[] {
    return node.children.flatMap((child) => [child, ...descendants(child)]);
  }
  document.createElement = (tag) => {
    const node = create(tag);
    Object.assign(node, {
      focus() {},
      maxLength: 4000,
      id: '',
      isConnected: true,
    });
    Object.defineProperty(node, 'parentElement', { get: () => node.parent });
    node.querySelector = (selector) => query(node, selector);
    Object.defineProperty(node, 'innerHTML', {
      set: () => {
        const input = document.createElement('input'),
          grid = document.createElement('div'),
          status = document.createElement('p');
        input.setAttribute('data-gif-query', '');
        grid.setAttribute('data-gif-grid', '');
        status.setAttribute('data-gif-status', '');
        node.replaceChildren(input, grid, status);
      },
    });
    return node;
  };
  const globals = {
    document,
    HTMLLabelElement: CommunityNode,
    window: { setTimeout: globalThis.setTimeout },
  };
  const saved = Object.keys(globals).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  let reads = 0,
    published = 0;
  const url = 'https://static.klipy.com/ii/synthetic/file.mp4';
  t.mock.method(GifSearch.prototype, 'available', () => Promise.resolve(true));
  t.mock.method(GifSearch.prototype, 'page', () => {
    reads++;
    return Promise.resolve({
      items: [
        {
          id: 'gif',
          title: 'GIF sintético',
          preview: 'https://static.klipy.com/ii/synthetic/file.webp',
          clip: url,
          width: 64,
          height: 64,
        },
      ],
      next: false,
    });
  });
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('No outbound request in synthetic DOM');
  });
  const abort = new AbortController();
  try {
    const container = document.createElement('form'),
      label = document.createElement('label'),
      text = document.createElement('textarea');
    text.value = 'Legenda';
    label.append(text);
    container.append(label);
    const getMedia = postEditorMedia({
      container: container as unknown as HTMLElement,
      text: text as unknown as HTMLTextAreaElement,
      ids: [],
      access: {
        community: crypto.randomUUID(),
        signal: abort.signal,
        valid: () => true,
        request: () => {
          published++;
          return Promise.resolve(null);
        },
        privacy: {
          authorize: () => Promise.resolve(true),
          signal: abort.signal,
        } as unknown as ExternalMediaConsent,
      },
    });
    assert.equal(reads, 0);
    container.querySelector('.post-gif-button')!.click();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(reads, 1);
    const tile = container.querySelector('.gif-tile')!;
    tile.click();
    assert.equal(text.value, `Legenda\n${url}`);
    assert.equal(container.querySelector('.post-gif-pane')!.hidden, true);
    assert.equal(published, 0);
    assert.deepEqual(await getMedia(), []);
    assert.equal(published, 0);
  } finally {
    abort.abort();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
