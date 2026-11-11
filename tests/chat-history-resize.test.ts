import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import {
  historyPosition,
  resetHistoryPosition,
  watchHistoryPosition,
} from '../src/client/chat-ui/index.ts';
import { setHistoryWindowReturn } from '../src/client/chat-ui/history-position.ts';

function fixture(t: TestContext) {
  const observers: { resize: () => void; disconnected: boolean }[] = [];
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    'ResizeObserver',
  );
  class Observer {
    disconnected = false;
    readonly resize: () => void;
    constructor(resize: () => void) {
      this.resize = resize;
      observers.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: Observer,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'ResizeObserver', previous);
    else Reflect.deleteProperty(globalThis, 'ResizeObserver');
  });
  const attributes = new Map<string, string>();
  const button = Object.assign(new EventTarget(), {
    hidden: true,
    textContent: '',
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    getAttribute: (name: string) => attributes.get(name) ?? null,
  });
  let attached = 0;
  const history = Object.assign(new EventTarget(), {
    hidden: false,
    clientWidth: 360,
    clientHeight: 400,
    scrollHeight: 1200,
    childElementCount: 12,
    ownerDocument: { createElement: () => button },
    after: () => {
      attached++;
    },
  });
  let top = 800;
  Object.defineProperty(history, 'scrollTop', {
    get: () => top,
    set: (value: number) => {
      top = Math.max(
        0,
        Math.min(value, history.scrollHeight - history.clientHeight),
      );
    },
  });
  const element = history as unknown as HTMLElement;
  const lifetime = new AbortController();
  t.after(() => lifetime.abort());
  watchHistoryPosition(element, lifetime.signal);
  const scroll = (value: number) => {
    element.scrollTop = value;
    history.dispatchEvent(new Event('scroll'));
  };
  return {
    history,
    element,
    lifetime,
    observers,
    scroll,
    button,
    attributes,
    attached: () => attached,
  };
}

await test('keyboard animation and growing composer retain the latest messages despite early native scroll events', (t) => {
  const f = fixture(t);
  for (const height of [350, 250, 200, 400]) {
    f.history.clientHeight = height;
    f.history.dispatchEvent(new Event('scroll'));
    f.observers[0]!.resize();
    assert.equal(f.element.scrollTop, 1200 - height);
  }
});

await test('scrolling up without arrivals shows one shortcut; jumping or manually returning hides it', (t) => {
  const f = fixture(t);
  assert.equal(f.attached(), 0);
  f.scroll(200);
  assert.equal(f.button.hidden, false);
  assert.equal(f.button.textContent, '');
  assert.equal(f.attributes.get('aria-label'), 'Return to latest messages');
  f.button.dispatchEvent(new Event('click'));
  assert.equal(f.element.scrollTop, 800);
  assert.equal(f.button.hidden, true);
  f.scroll(300);
  assert.equal(f.button.hidden, false);
  assert.equal(f.attached(), 1);
  f.scroll(800);
  assert.equal(f.button.hidden, true);
  f.scroll(200);
  f.lifetime.abort();
  assert.equal(f.button.hidden, true);
  f.scroll(100);
  assert.equal(
    f.button.hidden,
    true,
    'a departed history cannot reshow its shortcut',
  );
});

await test('an anchored window uses its reader return operation even at the displayed page bottom', (t) => {
  const f = fixture(t);
  let returns = 0;
  setHistoryWindowReturn(f.element, () => {
    returns++;
    f.scroll(120);
    const restore = historyPosition(f.element);
    f.history.scrollHeight = 1800;
    restore();
    setHistoryWindowReturn(f.element, undefined);
  });
  assert.equal(f.button.hidden, false);
  f.button.dispatchEvent(new Event('click'));
  assert.equal(returns, 1);
  assert.equal(f.element.scrollTop, 1400);
  assert.equal(f.button.hidden, true);
});

await test('message rendering between resize and observer delivery retains follow intent', (t) => {
  const f = fixture(t);
  f.history.clientHeight = 250;
  const restore = historyPosition(f.element);
  f.history.scrollHeight = 1400;
  restore();
  f.observers[0]!.resize();
  assert.equal(f.element.scrollTop, 1150);
});

await test('deliberate reading above latest survives resizing, hiding and reopening', (t) => {
  const f = fixture(t);
  f.scroll(200);
  f.history.clientHeight = 250;
  f.observers[0]!.resize();
  assert.equal(f.element.scrollTop, 200);
  f.history.hidden = true;
  f.history.clientHeight = 0;
  f.element.scrollTop = 0;
  f.observers[0]!.resize();
  f.history.hidden = false;
  f.history.clientHeight = 400;
  f.observers[0]!.resize();
  assert.equal(f.element.scrollTop, 200);
  f.scroll(800);
  f.history.clientHeight = 200;
  f.observers[0]!.resize();
  assert.equal(f.element.scrollTop, 1000);
});

await test('conversation reset follows latest; deduplicated observers stop with their owning lifetime', (t) => {
  const f = fixture(t);
  watchHistoryPosition(f.element, f.lifetime.signal);
  assert.equal(f.observers.length, 1);
  f.scroll(200);
  resetHistoryPosition(f.element);
  f.history.clientHeight = 250;
  f.observers[0]!.resize();
  assert.equal(f.element.scrollTop, 950);
  f.lifetime.abort();
  assert.equal(f.observers[0]!.disconnected, true);
  f.history.clientHeight = 200;
  f.observers[0]!.resize();
  assert.equal(
    f.element.scrollTop,
    950,
    'a queued callback cannot mutate a closed history',
  );
  const next = new AbortController();
  watchHistoryPosition(f.element, next.signal);
  assert.equal(f.observers.length, 2);
  next.abort();
  assert.equal(f.observers[1]!.disconnected, true);
});
