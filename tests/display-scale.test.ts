import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  layoutBox,
  layoutLength,
  layoutViewport,
} from '../src/client/display-scale/index.ts';

await test('viewport geometry converts to the zoomed page pixels that style lengths use', (t) => {
  const zoomed = { currentCSSZoom: 0.95 } as unknown as Element,
    plain = {} as unknown as Element;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { innerWidth: 1900, innerHeight: 950 },
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'window'));
  assert.deepEqual(
    layoutBox(
      { left: 95, top: 190, right: 380, bottom: 475 } as DOMRect,
      zoomed,
    ),
    { left: 100, top: 200, right: 400, bottom: 500 },
  );
  assert.deepEqual(layoutViewport(zoomed), { width: 2000, height: 1000 });
  assert.equal(layoutLength(19, zoomed), 20);
  // Phones and older engines without the property keep viewport pixels.
  assert.equal(layoutLength(19, plain), 19);
  assert.deepEqual(layoutViewport(plain), { width: 1900, height: 950 });
});
