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
