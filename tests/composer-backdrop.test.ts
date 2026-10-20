import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindComposerBackdrop } from '../src/client/communities/composer-backdrop.ts';

class Dialog extends EventTarget {
  getBoundingClientRect() {
    return { left: 100, top: 100, right: 500, bottom: 600 };
  }
}
function pointer(type: string, x: number, button = 0): MouseEvent {
  return Object.assign(new Event(type, { cancelable: true }), {
    clientX: x,
    clientY: 150,
    button,
  }) as MouseEvent;
}
function fixture() {
  const dialog = new Dialog(),
    abort = new AbortController();
  let closes = 0;
  bindComposerBackdrop(dialog as unknown as HTMLDialogElement, {
    signal: abort.signal,
    requestClose: () => {
      closes++;
    },
  });
  const gesture = (start: number, finish: number, button = 0): MouseEvent => {
    dialog.dispatchEvent(pointer('pointerdown', start, button));
    const click = pointer('click', finish, button);
    dialog.dispatchEvent(click);
    return click;
  };
  return { dialog, abort, gesture, closes: () => closes };
}

await test('backdrop dismissal consumes the click even when a draft requires confirmation', () => {
  const view = fixture();
  const click = view.gesture(50, 50);
  assert.equal(view.closes(), 1);
  assert.equal(click.defaultPrevented, true);
  // A second click without a fresh pointer gesture cannot reuse the first one.
  view.dialog.dispatchEvent(pointer('click', 50));
  assert.equal(view.closes(), 1);
  view.abort.abort();
});

await test('padding, dragging outside, secondary button and cancelled gesture preserve the composer', () => {
  const view = fixture();
  for (const [start, finish, button] of [
    [120, 120, 0],
    [120, 50, 0],
    [50, 120, 0],
    [50, 50, 2],
  ]) {
    assert.equal(view.gesture(start!, finish!, button).defaultPrevented, false);
  }
  view.dialog.dispatchEvent(pointer('pointerdown', 50));
  view.dialog.dispatchEvent(new Event('pointercancel'));
  view.dialog.dispatchEvent(pointer('click', 50));
  assert.equal(view.closes(), 0);
  view.abort.abort();
});

await test('leaving the screen ends dismissal handlers without consuming future clicks', () => {
  const view = fixture();
  view.abort.abort();
  assert.equal(view.gesture(50, 50).defaultPrevented, false);
  assert.equal(view.closes(), 0);
});
