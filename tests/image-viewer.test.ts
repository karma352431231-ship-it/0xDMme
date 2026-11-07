import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { openImageViewer } from '../src/client/image-viewer/index.ts';
import { settledZoom, zoomedFrom } from '../src/client/image-viewer/zoom.ts';

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
  assert.match(f.image.style['transform'] ?? '', /scale\(2\.5\)/u);
  f.image.click();
  assert.equal(f.dialog.classes.has('zoomed'), false);
  assert.equal(f.image.style['transform'], '');
  assert.equal(f.open(), true);
});

const framed = {
  image: { width: 300, height: 200 },
  frame: { x: 400, y: 800 },
};
await test('pinching keeps the image point under the fingers', () => {
  const center = { x: 200, y: 400 };
  const next = zoomedFrom(
    {
      state: { scale: 1, x: 0, y: 0 },
      points: [
        { x: 100, y: 300 },
        { x: 200, y: 300 },
      ],
    },
    [
      { x: 50, y: 300 },
      { x: 250, y: 300 },
    ],
    center,
  );
  assert.equal(next.scale, 2);
  // The midpoint (150, 300) sits 50 left and 100 above the center before and after.
  assert.equal(center.x + next.x + next.scale * -50, 150);
  assert.equal(center.y + next.y + next.scale * -100, 300);
});

await test('zoom stays within its limits and the image edges on release', () => {
  const huge = zoomedFrom(
    {
      state: { scale: 1, x: 0, y: 0 },
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    },
    [
      { x: 0, y: 0 },
      { x: 500, y: 0 },
    ],
    { x: 0, y: 0 },
  );
  assert.equal(huge.scale, 5);
  assert.deepEqual(settledZoom({ scale: 1, x: 40, y: 40 }, framed), {
    scale: 1,
    x: 0,
    y: 0,
  });
  assert.deepEqual(settledZoom({ scale: 0.8, x: 5, y: 5 }, framed), {
    scale: 1,
    x: 0,
    y: 0,
  });
  // 600 wide in a 400 frame may move 100 each way; 400 tall in 800 may not move.
  assert.deepEqual(settledZoom({ scale: 2, x: 999, y: 999 }, framed), {
    scale: 2,
    x: 100,
    y: 0,
  });
});

for (const where of ['frame', 'dialog', 'close'] as const)
  await test(`tapping the ${where === 'close' ? 'X' : `${where} around the image`} closes the viewer`, (t) => {
    const f = viewer(t);
    f[where].click();
    assert.equal(f.open(), false);
  });
