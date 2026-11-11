import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import {
  historyPosition,
  resetHistoryPosition,
  watchHistoryPosition,
} from '../src/client/chat-ui/index.ts';

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
  const history = Object.assign(new EventTarget(), {
    hidden: false,
    clientWidth: 360,
    clientHeight: 400,
    scrollHeight: 1200,
    childElementCount: 12,
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
  return { history, element, lifetime, observers, scroll };
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
