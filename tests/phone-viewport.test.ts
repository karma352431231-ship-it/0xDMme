import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const bundled = await build({
  entryPoints: ['src/client/phone-viewport/index.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'PhoneViewport',
  write: false,
});
function fixture() {
  const values = new Map<string, string>();
  const viewport = Object.assign(new EventTarget(), {
    height: 780,
    offsetTop: 0,
    scale: 1,
  });
  const phone = Object.assign(new EventTarget(), { matches: true });
  const window = Object.assign(new EventTarget(), { visualViewport: viewport });
  const context = {
    window,
    matchMedia: () => phone,
    AbortController,
    document: {
      documentElement: {
        style: {
          setProperty: (key: string, value: string) => values.set(key, value),
          removeProperty: (key: string) => values.delete(key),
        },
      },
    },
    PhoneViewport: {} as { startPhoneViewport(): () => void },
  };
  runInNewContext(bundled.outputFiles[0]!.text, context);
  const close = context.PhoneViewport.startPhoneViewport();
  return { values, viewport, phone, window, close };
}
await test('phone geometry follows keyboard resize and panning and returns to the original size', () => {
  const f = fixture();
  assert.equal(f.values.get('--phone-viewport-height'), '780px');
  f.viewport.height = 370;
  f.viewport.offsetTop = 42;
  f.viewport.dispatchEvent(new Event('resize'));
  assert.equal(f.values.get('--phone-viewport-height'), '370px');
  assert.equal(f.values.get('--phone-viewport-top'), '42px');
  f.viewport.height = 780;
  f.viewport.offsetTop = 0;
  f.viewport.dispatchEvent(new Event('scroll'));
  assert.equal(f.values.get('--phone-viewport-height'), '780px');
  assert.equal(f.values.get('--phone-viewport-top'), '0px');
  f.close();
});
await test('pinch zoom and desktop layouts retain their own viewport; disposal releases listeners', () => {
  const f = fixture();
  f.viewport.scale = 1.5;
  f.viewport.dispatchEvent(new Event('resize'));
  assert.equal(f.values.size, 0);
  f.viewport.scale = 1;
  f.viewport.dispatchEvent(new Event('resize'));
  assert.equal(f.values.size, 2);
  f.phone.matches = false;
  f.phone.dispatchEvent(new Event('change'));
  assert.equal(f.values.size, 0);
  f.phone.matches = true;
  f.phone.dispatchEvent(new Event('change'));
  f.close();
  f.viewport.dispatchEvent(new Event('resize'));
  assert.equal(f.values.size, 0);
});
await test('back-forward cache preserves metrics ownership; actual departure disposes it', () => {
  const f = fixture();
  f.window.dispatchEvent(
    Object.assign(new Event('pagehide'), { persisted: true }),
  );
  f.viewport.height = 400;
  f.viewport.dispatchEvent(new Event('resize'));
  assert.equal(f.values.get('--phone-viewport-height'), '400px');
  f.window.dispatchEvent(
    Object.assign(new Event('pagehide'), { persisted: false }),
  );
  f.viewport.dispatchEvent(new Event('resize'));
  assert.equal(f.values.size, 0);
});
