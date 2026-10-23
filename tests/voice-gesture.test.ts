import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { bindRecordGesture } from '../src/client/chat-ui/voice.ts';

function gesture(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const window = Object.assign(new EventTarget(), { setTimeout });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: window,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const form = { dataset: {} as Record<string, string> };
  const button = Object.assign(new EventTarget(), {
    disabled: false,
    closest: () => form,
  });
  let starts = 0,
    releases = 0;
  const abort = new AbortController();
  bindRecordGesture(button as unknown as HTMLButtonElement, {
    signal: abort.signal,
    start: () => {
      starts++;
    },
    release: () => {
      releases++;
    },
  });
  return {
    abort,
    form,
    button,
    window,
    counts: () => ({ starts, releases }),
    down: () =>
      button.dispatchEvent(
        Object.assign(new Event('pointerdown'), { pointerType: 'touch' }),
      ),
  };
}

await test('disposing a held microphone before its delay cannot start recording on an abandoned composer', (t) => {
  const view = gesture(t);
  view.down();
  view.abort.abort();
  t.mock.timers.tick(1000);
  view.window.dispatchEvent(new Event('pointerup'));
  view.button.dispatchEvent(new Event('click'));
  assert.deepEqual(view.counts(), { starts: 0, releases: 0 });
  assert.equal(view.form.dataset['voiceHold'], undefined);
});

await test('holding and releasing still records once; disposal clears the remaining gesture state', (t) => {
  const view = gesture(t);
  view.down();
  t.mock.timers.tick(250);
  assert.deepEqual(view.counts(), { starts: 1, releases: 0 });
  assert.equal(view.form.dataset['voiceHold'], 'true');
  view.window.dispatchEvent(new Event('pointerup'));
  assert.deepEqual(view.counts(), { starts: 1, releases: 1 });
  view.abort.abort();
  t.mock.timers.tick(1000);
  assert.equal(view.form.dataset['voiceHold'], undefined);
});
