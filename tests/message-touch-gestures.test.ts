import assert from 'node:assert/strict';
import { test } from 'node:test';
import { messageGestures } from '../src/client/message-menu/gestures.ts';
class Bubble extends EventTarget {
  style = { setProperty: () => {}, removeProperty: () => {} };
  closest() {
    return null;
  }
}
function pointer(
  row: Bubble,
  type: string,
  point: { x: number; y: number; kind?: string },
): void {
  row.dispatchEvent(
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
  pointer(row, 'pointerup', { x: 64, y: 12 });
  assert.equal(replies, 1);
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
