import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  holdKeyboardSpace,
  replaceKeyboardWithDock,
} from '../src/client/emoji/keyboard-handoff.ts';

await test('keyboard handoff consumes every resize frame instead of removing the full dock at a small resize', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const viewport = Object.assign(new EventTarget(), { height: 800 });
  const window = Object.assign(new EventTarget(), { visualViewport: viewport });
  let removed = false;
  const placeholder = {
    style: { height: '' },
    className: '',
    remove: () => {
      removed = true;
    },
  };
  const values = new Map<string, string>();
  const input = {} as HTMLTextAreaElement;
  const host = {
    contains: () => false,
    after: () => {},
    getBoundingClientRect: () => ({ height: 340 }),
    style: {
      setProperty: (k: string, v: string) => values.set(k, v),
      removeProperty: (k: string) => values.delete(k),
    },
  };
  const document = {
    activeElement: null as null | HTMLTextAreaElement,
    createElement: () => placeholder,
  };
  for (const [name, value] of Object.entries({ window, document })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const stop = holdKeyboardSpace(host as unknown as HTMLElement);
  for (const [height, reserved] of [
    [730, 270],
    [600, 140],
    [460, 0],
  ]) {
    viewport.height = height!;
    viewport.dispatchEvent(new Event('resize'));
    assert.equal(placeholder.style.height, `${reserved}px`);
    assert.equal(removed, reserved === 0);
  }
  stop();
  document.activeElement = input;
  const close = replaceKeyboardWithDock(host as unknown as HTMLElement, input);
  assert.equal(values.get('--emoji-replaced-height'), '0px');
  viewport.height = 530;
  viewport.dispatchEvent(new Event('resize'));
  assert.equal(values.get('--emoji-replaced-height'), '70px');
  viewport.height = 800;
  viewport.dispatchEvent(new Event('resize'));
  assert.equal(values.get('--emoji-replaced-height'), '340px');
  t.mock.timers.tick(600);
  assert.equal(values.get('--emoji-replaced-height'), '340px');
  viewport.height = 600;
  viewport.dispatchEvent(new Event('resize'));
  assert.equal(
    values.get('--emoji-replaced-height'),
    '340px',
    'Completed handoff owns no resize listener',
  );
  close();
  assert.equal(values.size, 0);
});
