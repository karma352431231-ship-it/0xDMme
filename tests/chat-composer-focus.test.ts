import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindChatComposer } from '../src/client/chat-ui/index.ts';

function element() {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  return {
    listeners,
    style: {} as Record<string, string>,
    addEventListener(type: string, listener: (event: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
  };
}

for (const focused of [true, false])
  await test(`pressing send ${focused ? 'keeps focus in the typed field' : 'leaves focus alone when the field is not focused'}`, (t) => {
    const text = element(),
      send = element(),
      form = {
        querySelector: (selector: string) =>
          selector === 'textarea'
            ? text
            : selector === '[data-compose-send]'
              ? send
              : null,
        querySelectorAll: () => [],
      };
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { activeElement: focused ? text : null },
    });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, 'document', previous);
      else Reflect.deleteProperty(globalThis, 'document');
    });
    bindChatComposer(form as unknown as HTMLElement, () => {});
    for (const type of ['pointerdown', 'mousedown']) {
      let prevented = false;
      for (const listener of send.listeners.get(type) ?? [])
        listener({
          preventDefault: () => {
            prevented = true;
          },
        });
      assert.equal(prevented, focused, type);
    }
  });
