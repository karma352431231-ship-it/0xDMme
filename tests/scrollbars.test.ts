import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  scrollbarIdleMs,
  startScrollbarFade,
} from '../src/client/scrollbars/index.ts';

class FakeElement {
  readonly attributes = new Set<string>();
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
  setAttribute(name: string): void {
    this.attributes.add(name);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
}
function scroll(root: EventTarget, target: unknown): void {
  const event = new Event('scroll');
  Object.defineProperty(event, 'target', { value: target });
  root.dispatchEvent(event);
}

await test('a scrollbar shows while its area scrolls and fades 2s after the last scroll', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const globals = globalThis as Record<string, unknown>;
  const previous = { Element: globals['Element'], window: globals['window'] };
  globals['Element'] = FakeElement;
  globals['window'] = globalThis;
  context.after(() => Object.assign(globals, previous));
  const page = new FakeElement(),
    feed = new FakeElement(),
    root = Object.assign(new EventTarget(), { scrollingElement: page });
  startScrollbarFade(root as unknown as Document);
  startScrollbarFade(root as unknown as Document);

  scroll(root, feed);
  assert.equal(feed.hasAttribute('data-scrolling'), true);
  context.mock.timers.tick(scrollbarIdleMs - 1);
  scroll(root, feed);
  context.mock.timers.tick(scrollbarIdleMs - 1);
  assert.equal(
    feed.hasAttribute('data-scrolling'),
    true,
    'scrolling again restarts the wait',
  );
  context.mock.timers.tick(1);
  assert.equal(feed.hasAttribute('data-scrolling'), false);

  scroll(root, root);
  assert.equal(
    page.hasAttribute('data-scrolling'),
    true,
    'document scrolls mark the page',
  );
  assert.equal(feed.hasAttribute('data-scrolling'), false);
  context.mock.timers.tick(scrollbarIdleMs);
  assert.equal(page.hasAttribute('data-scrolling'), false);
});
