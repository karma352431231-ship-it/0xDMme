import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { openImageViewer } from '../src/client/image-viewer/index.ts';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, ((event: unknown) => void)[]>();
  readonly classes = new Set<string>();
  readonly style: Record<string, string> = {};
  parent: FakeElement | null = null;
  className = '';
  src = '';
  alt = '';
  type = '';
  naturalWidth = 800;
  clientWidth = 400;
  isConnected = true;
  readonly classList = {
    toggle: (name: string, on: boolean) => {
      if (on) this.classes.add(name);
      else this.classes.delete(name);
    },
  };
  readonly tag: string;
  constructor(tag: string) {
    this.tag = tag;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  removeEventListener(): void {}
  remove(): void {
    this.parent = null;
  }
  showModal(): void {}
  focus(): void {}
  /** Dispatches like a bubbling click from this element. */
  click(): void {
    let stopped = false;
    const event = {
      target: this,
      stopPropagation: () => {
        stopped = true;
      },
    };
    const path: FakeElement[] = [];
    for (let node: FakeElement | null = this.parent; node; node = node.parent)
      path.push(node);
    for (const node of [this as FakeElement, ...path]) {
      if (stopped) return;
      for (const listener of node.listeners.get('click') ?? []) listener(event);
    }
  }
}
function viewer(t: TestContext) {
  const body = new FakeElement('body');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body,
      createElement: (tag: string) => new FakeElement(tag),
      createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  openImageViewer({
    url: 'blob:synthetic',
    alt: 'Synthetic photo',
    trigger: new FakeElement('button') as unknown as HTMLButtonElement,
    signal: new AbortController().signal,
  });
  const dialog = body.children[0]!,
    frame = dialog.children.find(
      (node) => node.className === 'public-image-frame',
    )!,
    image = frame.children[0]!,
    close = dialog.children.find(
      (node) => node.className === 'public-image-close',
    )!;
  return { dialog, frame, image, close, open: () => dialog.parent === body };
}

await test('the viewer shows only the image and an icon close button', (t) => {
  const f = viewer(t);
  assert.deepEqual(
    f.dialog.children.map((node) => node.className),
    ['public-image-frame', 'public-image-close'],
  );
  assert.equal(f.close.attributes.get('aria-label'), 'Close');
  assert.equal(f.close.children[0]?.tag, 'svg');
});

await test('tapping the image zooms in and out without closing', (t) => {
  const f = viewer(t);
  f.image.click();
  assert.equal(f.dialog.classes.has('zoomed'), true);
  assert.equal(f.image.style['width'], '800px');
  f.image.click();
  assert.equal(f.dialog.classes.has('zoomed'), false);
  assert.equal(f.open(), true);
});

for (const where of ['frame', 'dialog', 'close'] as const)
  await test(`tapping the ${where === 'close' ? 'X' : `${where} around the image`} closes the viewer`, (t) => {
    const f = viewer(t);
    f[where].click();
    assert.equal(f.open(), false);
  });
