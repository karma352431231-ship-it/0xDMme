import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DiscoveryChoices } from '../src/client/contacts/discovery-choices.ts';
import { setActiveLanguage } from '../src/shared/i18n/index.ts';
import { CommunityNode } from './fixtures/community-dom.ts';

await test('private discovery has two localized options and delayed, cancellable explanations without help buttons', (t) => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const host = new CommunityNode(),
    container = { querySelector: () => host };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => new CommunityNode(tag) },
  });
  t.after(() => {
    if (prior) Object.defineProperty(globalThis, 'document', prior);
    else Reflect.deleteProperty(globalThis, 'document');
    setActiveLanguage('en');
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const choices = new DiscoveryChoices();
  t.after(() => choices.clear());
  for (const language of ['en', 'zh-CN'] as const) {
    setActiveLanguage(language);
    choices.mount(container as unknown as HTMLElement);
    assert.equal(host.querySelectorAll('input').length, 2);
    assert.equal(host.querySelectorAll('button').length, 0);
    assert.equal(host.textContent.includes('Approved contacts only'), false);
    assert.ok(
      host.textContent.includes(
        language === 'en'
          ? 'People who know your wallet address can send you a chat invitation'
          : '知道你钱包地址的人可以向你发送聊天邀请',
      ),
    );
  }
  const row = host.querySelector('.discovery-choice')!,
    tip = row.querySelector('.discovery-tip')!;
  const hover = () =>
    row.dispatchEvent(
      Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }),
    );
  hover();
  t.mock.timers.tick(999);
  assert.equal(tip.hidden, true);
  row.dispatchEvent(new Event('pointerleave'));
  t.mock.timers.tick(1000);
  assert.equal(tip.hidden, true, 'Leaving cancels an unfinished hover');
  hover();
  t.mock.timers.tick(1000);
  assert.equal(tip.hidden, false);
  row.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  assert.equal(tip.hidden, true);
  hover();
  choices.clear();
  t.mock.timers.tick(1000);
  assert.equal(tip.hidden, true, 'Leaving the screen cancels pending tips');
  row.dispatchEvent(
    Object.assign(new Event('pointerenter'), { pointerType: 'touch' }),
  );
  t.mock.timers.tick(1000);
  assert.equal(tip.hidden, true, 'Touch cannot accidentally open a hover tip');
  choices.value = 'contacts';
  assert.equal(choices.value, 'contacts');
  assert.ok(host.querySelectorAll('input').every((field) => !field.checked));
});
