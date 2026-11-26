import assert from 'node:assert/strict';
import test from 'node:test';

// A document that only dispatches the events the guard listens to.
const page = new EventTarget();
Object.defineProperty(globalThis, 'document', {
  value: page,
  configurable: true,
});
const { scrollTap, watchScrollTaps } =
  await import('../src/client/image-viewer/scroll-tap.ts');

function touchEvent(type: string, x: number, y: number): Event {
  const event = new Event(type);
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }],
  });
  return event;
}
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await test('a still tap opens a picture; a drag or a touch during scrolling does not', async () => {
  watchScrollTaps();
  page.dispatchEvent(touchEvent('touchstart', 100, 100));
  page.dispatchEvent(touchEvent('touchmove', 104, 103));
  assert.equal(scrollTap(), false, 'a few pixels of jitter is still a tap');

  page.dispatchEvent(touchEvent('touchstart', 100, 100));
  page.dispatchEvent(touchEvent('touchmove', 100, 140));
  assert.equal(scrollTap(), true, 'the finger dragged the page');

  page.dispatchEvent(new Event('scroll'));
  page.dispatchEvent(touchEvent('touchstart', 100, 100));
  assert.equal(scrollTap(), true, 'the touch stopped a moving page');

  await wait(300);
  page.dispatchEvent(touchEvent('touchstart', 100, 100));
  assert.equal(scrollTap(), false, 'once the page is still, taps open again');

  const mouse = new Event('pointerdown');
  Object.defineProperty(mouse, 'pointerType', { value: 'mouse' });
  page.dispatchEvent(touchEvent('touchstart', 100, 100));
  page.dispatchEvent(touchEvent('touchmove', 100, 160));
  page.dispatchEvent(mouse);
  assert.equal(scrollTap(), false, 'a mouse click is judged on its own');
});
