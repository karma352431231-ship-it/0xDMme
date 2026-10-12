import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anchoredMessageMenu } from '../src/client/message-menu/index.ts';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';
await test('menu de mensagem fica limitado ao chat, sem modal, e fecha em ação, fora e revogação', () => {
  const document = communityDocument(),
    window = new EventTarget();
  const chatBounds = { left: 300, right: 500, top: 200, bottom: 600 };
  const create = document.createElement;
  document.createElement = (tag) =>
    Object.assign(create(tag), {
      style: {},
      offsetWidth: 200,
      offsetHeight: 180,
      focus() {},
      closest(selector: string) {
        if (selector === '.chat-panel')
          return { getBoundingClientRect: () => chatBounds };
        if (selector === 'button' && tag === 'button') return this;
        return null;
      },
      getBoundingClientRect() {
        return { left: 450, right: 480, top: 500, bottom: 530 };
      },
    });
  const globals = {
    document,
    window,
    Node: CommunityNode,
    Element: CommunityNode,
    innerWidth: 900,
    innerHeight: 800,
  };
  const saved = Object.keys(globals).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  try {
    const lifetime = new AbortController(),
      menu = anchoredMessageMenu({ signal: lifetime.signal });
    const panel = menu.panel as unknown as CommunityNode & {
      style: { left: string; top: string; width: string };
      hidden: boolean;
    };
    const action = document.createElement('button');
    menu.panel.append(action as unknown as HTMLElement);
    menu.trigger.click();
    assert.equal(panel.hidden, false);
    assert.equal(panel.style.left, '300px');
    assert.equal(panel.style.top, '320px');
    assert.equal(panel.style.width, '200px');
    assert.equal(menu.trigger.getAttribute('aria-expanded'), 'true');
    const event = new Event('click');
    Object.defineProperty(event, 'target', { value: action });
    panel.dispatchEvent(event);
    assert.equal(panel.hidden, true);
    menu.trigger.click();
    const outside = new Event('click');
    Object.defineProperty(outside, 'target', { value: new CommunityNode() });
    document.dispatchEvent(outside);
    assert.equal(panel.hidden, true);
    menu.trigger.click();
    lifetime.abort();
    assert.equal(panel.hidden, true);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
