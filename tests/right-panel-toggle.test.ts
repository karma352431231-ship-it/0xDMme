import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { panelControlSelector, startPanels } from '../src/client/app/panels.ts';

class LayoutButton {
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  constructor(markup: string) {
    for (const match of markup.matchAll(/\b(data-[\w-]+)(?:="([^"]*)")?/gu))
      this.attributes.set(match[1]!, match[2] ?? '');
  }
  closest(selector: string): LayoutButton | null {
    return selector === panelControlSelector ? this : null;
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

await test('the feed header button hides only the right panel and preserves the mounted feed, filters and scroll', async (t) => {
  const html = await readFile(
    new URL('../src/client/app/index.html', import.meta.url),
    'utf8',
  );
  const heading = html.match(
    /<header class="feed-panel-heading">([\s\S]*?)<\/header>/u,
  )?.[1];
  assert.ok(heading);
  const markup = heading.match(/<button[\s\S]*?<\/button>/u)?.[0];
  assert.ok(markup);
  for (const right of ['chat', 'communities', 'users']) {
    await t.test(right, async () => {
      const control = new LayoutButton(markup);
      const document = new EventTarget();
      const window = new EventTarget();
      const location = {
        hash: '',
        pathname: '/split/feed',
        search: '?order=recent',
      };
      const setAddress = (
        _state: unknown,
        _title: string,
        href: string,
      ): void => {
        const url = new URL(href, 'https://app.invalid');
        Object.assign(location, {
          hash: url.hash,
          pathname: url.pathname,
          search: url.search,
        });
      };
      const shell = {
        dataset: { right } as Record<string, string>,
        querySelectorAll: (selector: string) =>
          selector === '[data-chat-split]' ? [control] : [],
      };
      let mounts = 0,
        leaves = 0,
        replacements = 0;
      const container = {
        scrollTop: 240,
        replaceChildren: () => {
          replacements++;
        },
      };
      const values = {
        document,
        window,
        location,
        Element: LayoutButton,
        history: { replaceState: setAddress, pushState: setAddress },
        localStorage: { getItem: () => null, setItem: () => {} },
        matchMedia: () => ({ matches: true, addEventListener: () => {} }),
      };
      const previous = new Map<string, PropertyDescriptor | undefined>();
      for (const [key, value] of Object.entries(values)) {
        previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { configurable: true, value });
      }
      try {
        const panels = startPanels({
          shell: shell as unknown as HTMLElement,
          feedBody: container as unknown as HTMLElement,
          publicChat: container as unknown as HTMLElement,
          publicDirectory: container as unknown as HTMLElement,
          communities: {
            mountFeed: () => {
              mounts++;
            },
            leaveFeed: () => {
              leaves++;
            },
            openDm: () => {},
            closeDm: () => {},
            dmDirectory: () => Promise.resolve(),
            showProfile: () => () => {},
          },
          publicChatOpened: () => {},
        });
        window.addEventListener('hashchange', () => panels.routed('conversas'));
        panels.routed('conversas');
        const click = async () => {
          const event = new Event('click');
          Object.defineProperty(event, 'target', { value: control });
          document.dispatchEvent(event);
          await new Promise<void>((resolve) => setImmediate(resolve));
        };
        await click();
        assert.equal(shell.dataset['layout'], 'nochat');
        assert.equal(control.attributes.get('aria-pressed'), 'false');
        assert.equal(
          new URLSearchParams(location.search).get('order'),
          'recent',
        );
        assert.equal(location.pathname, '/split/feed');
        await click();
        assert.equal(shell.dataset['layout'], 'all');
        assert.equal(control.attributes.get('aria-pressed'), 'true');
        assert.equal(shell.dataset['right'], right);
        assert.equal(mounts, 1);
        assert.equal(leaves, 0);
        assert.equal(replacements, 0);
        assert.equal(container.scrollTop, 240);
      } finally {
        for (const [key, descriptor] of previous)
          if (descriptor) Object.defineProperty(globalThis, key, descriptor);
          else Reflect.deleteProperty(globalThis, key);
      }
    });
  }
});
