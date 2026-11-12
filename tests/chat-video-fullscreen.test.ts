import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toggleVideoFullscreen } from '../src/client/chat-video/fullscreen.ts';

await test('touch devices with the iOS player use it instead of element fullscreen', async (t) => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  t.after(() => {
    if (saved) Object.defineProperty(globalThis, 'matchMedia', saved);
    else Reflect.deleteProperty(globalThis, 'matchMedia');
  });
  for (const coarse of [true, false]) {
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: coarse }),
    });
    const calls: string[] = [];
    const document = { fullscreenElement: null, fullscreenEnabled: true };
    const stage = {
      ownerDocument: document,
      requestFullscreen: () => {
        calls.push('element');
        return Promise.resolve();
      },
    };
    const video = {
      ownerDocument: document,
      controls: false,
      webkitEnterFullscreen: () => calls.push('native'),
    };
    await toggleVideoFullscreen(
      stage as unknown as HTMLElement,
      video as unknown as HTMLVideoElement,
    );
    assert.deepEqual(calls, [coarse ? 'native' : 'element']);
    assert.equal(video.controls, coarse, 'the native player shows controls');
  }
});
