import assert from 'node:assert/strict';
import { test } from 'node:test';
import { messageGestures } from '../src/client/message-menu/gestures.ts';
class Bubble extends EventTarget {
  dataset: Record<string, string> = {};
  style = { setProperty: () => {}, removeProperty: () => {} };
  closest(selector?: string): Bubble | null {
    void selector;
    return null;
  }
}
function pointer(
  row: Bubble,
  type: string,
  point: { x: number; y: number; kind?: string },
): void {
  (type === 'pointerdown' || type === 'pointerleave'
    ? row
    : window
  ).dispatchEvent(
    Object.assign(new Event(type, { cancelable: true }), {
      clientX: point.x,
      clientY: point.y,
      pointerId: 1,
      isPrimary: true,
      pointerType: point.kind ?? 'touch',
    }),
  );
}
await test('touch hold opens once; a right swipe replies; scrolling/cancellation/abort preserve native intent', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: new EventTarget(),
  });
  t.after(() => {
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const row = new Bubble(),
    stop = new AbortController();
  let menus = 0,
    replies = 0;
  messageGestures(row as unknown as HTMLElement, {
    signal: stop.signal,
    menu: () => {
      menus++;
    },
    reply: () => {
      replies++;
    },
  });
  pointer(row, 'pointerdown', { x: 10, y: 10 });
  t.mock.timers.tick(500);
  assert.equal(menus, 1);
  pointer(row, 'pointermove', { x: 70, y: 10 });
  pointer(row, 'pointerup', { x: 70, y: 10 });
  assert.equal(replies, 0, 'A completed hold cannot also become a reply swipe');
  const click = new Event('click', { cancelable: true });
  row.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
  pointer(row, 'pointerdown', { x: 10, y: 10 });
  pointer(row, 'pointermove', { x: 64, y: 12 });
  pointer(row, 'pointerleave', { x: 64, y: 12 });
  pointer(row, 'pointerup', { x: 64, y: 12 });
  assert.equal(replies, 1);
  pointer(row, 'pointerdown', { x: 10, y: 10 });
  pointer(row, 'pointermove', { x: 54, y: 24 });
  pointer(row, 'pointerup', { x: 24, y: 10 });
  assert.equal(
    replies,
    2,
    'A reached reply threshold survives release coordinate drift',
  );
  pointer(row, 'pointerdown', { x: 10, y: 10 });
  pointer(row, 'pointermove', { x: 12, y: 36 });
  t.mock.timers.tick(600);
  assert.equal(menus, 1);
  pointer(row, 'pointerdown', { x: 10, y: 10 });
  pointer(row, 'pointercancel', { x: 10, y: 10 });
  t.mock.timers.tick(600);
  assert.equal(menus, 1);
  pointer(row, 'pointerdown', { x: 10, y: 10, kind: 'mouse' });
  t.mock.timers.tick(600);
  assert.equal(menus, 1);
  pointer(row, 'pointerdown', { x: 10, y: 10 });
  stop.abort();
  t.mock.timers.tick(600);
  assert.equal(menus, 1);
});

await test('a focused reply can switch repeatedly across bubbles and cleanly recover after interruption', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const surface = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: surface,
  });
  t.after(() => {
    if (saved) Object.defineProperty(globalThis, 'window', saved);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const stop = new AbortController();
  const rows = [new Bubble(), new Bubble()];
  const replies: number[] = [];
  rows.forEach((row, i) =>
    messageGestures(row as unknown as HTMLElement, {
      signal: stop.signal,
      menu: () => {},
      reply: () => replies.push(i),
    }),
  );
  for (let pass = 0; pass < 6; pass++) {
    const row = rows[pass % 2]!;
    const down = Object.assign(new Event('pointerdown', { cancelable: true }), {
      pointerType: 'touch',
      isPrimary: true,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    row.dispatchEvent(down);
    assert.equal(
      down.defaultPrevented,
      true,
      'Starting another reply preserves the keyboard focus',
    );
    pointer(row, 'pointermove', { x: 70, y: 12 });
    pointer(row, 'pointerleave', { x: 70, y: 12 });
    pointer(row, 'pointerup', { x: 70, y: 12 });
  }
  assert.deepEqual(replies, [0, 1, 0, 1, 0, 1]);
  pointer(rows[0]!, 'pointerdown', { x: 10, y: 10 });
  surface.dispatchEvent(new Event('blur'));
  pointer(rows[1]!, 'pointerdown', { x: 10, y: 10 });
  pointer(rows[1]!, 'pointermove', { x: 70, y: 10 });
  stop.abort();
  pointer(rows[1]!, 'pointerup', { x: 70, y: 10 });
  t.mock.timers.tick(600);
  assert.equal(replies.length, 6, 'Disposal stops active window listeners');
});

await test('a hold on a photo or video opens the options; other embedded controls keep their touch', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: new EventTarget(),
  });
  t.after(() => {
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  // The touched element answers closest() like an image button in a bubble.
  class Control extends Bubble {
    readonly hold: boolean;
    constructor(hold: boolean) {
      super();
      this.hold = hold;
    }
    override closest(selector?: string): Bubble | null {
      if (selector === '[data-message-hold]') return this.hold ? this : null;
      return this;
    }
  }
  for (const [hold, expected] of [
    [true, 1],
    [false, 0],
  ] as const) {
    const row = new Control(hold),
      stop = new AbortController();
    let menus = 0;
    messageGestures(row as unknown as HTMLElement, {
      signal: stop.signal,
      menu: () => {
        menus++;
      },
    });
    pointer(row, 'pointerdown', { x: 10, y: 10 });
    t.mock.timers.tick(500);
    pointer(row, 'pointerup', { x: 10, y: 10 });
    assert.equal(menus, expected, hold ? 'media hold' : 'plain control');
    stop.abort();
  }
});
