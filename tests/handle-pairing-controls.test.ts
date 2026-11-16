import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { PairingControls } from '../src/tools/chat-diagnostics/pairing-controls.ts';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';
import type { Recording } from '../src/tools/chat-diagnostics/recording.ts';
class MeterNode extends CommunityNode {
  style = { cssText: '' };
  readOnly = false;
  selected = false;
  onclick: (() => void) | null = null;
  get isConnected(): boolean {
    return this.parent !== null;
  }
  select(): void {
    this.selected = true;
  }
  override click(): void {
    if (!this.disabled) this.onclick?.();
  }
}
function fixture(t: TestContext, pair: (code?: string) => string) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => new MeterNode(tag) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const controls = new PairingControls(pair),
    form = controls.element as unknown as MeterNode;
  return {
    controls,
    code: form.querySelector('input') as MeterNode,
    button: (text: string) =>
      form.children.find((node) => node.textContent === text) as MeterNode,
  };
}
await test('sender and recipient controls explicitly share one temporary code and clear it when capture stops', (t) => {
  const code = 'a'.repeat(32),
    supplied: (string | undefined)[] = [];
  const f = fixture(t, (value) => {
    supplied.push(value);
    return value ?? code;
  });
  f.controls.update(false, false);
  f.button('Sender: create code').click();
  assert.equal(
    supplied.length,
    0,
    'an incompatible app cannot configure pairing',
  );
  f.controls.update(true, false);
  f.button('Sender: create code').click();
  assert.equal(f.code.value, code);
  assert.equal(f.code.readOnly, true);
  assert.equal(f.button('Recipient: use code').disabled, true);
  const recipient = fixture(t, (value) => {
    assert.equal(value, code);
    return code;
  });
  recipient.code.value = ` ${code} `;
  recipient.controls.update(true, false);
  recipient.button('Recipient: use code').click();
  assert.equal(recipient.code.value, code);
  recipient.controls.stop();
  f.controls.stop();
  assert.equal(recipient.code.value, '');
  assert.equal(f.code.value, '');
  assert.equal(recipient.button('Copy code').disabled, true);
});

await test('the console meter leaves the chat clear and hiding controls keeps capture active', async (t) => {
  interface ConsoleMeter {
    report(): ReturnType<Recording['report']>;
    stop(): ReturnType<Recording['report']>;
    mark(): void;
    showPanel(): void;
    hidePanel(): void;
  }
  const document = communityDocument();
  const host = Object.assign(new EventTarget(), {
    fetch,
    __0xdmmeLag: undefined as ConsoleMeter | undefined,
  });
  let nodesCreated = 0;
  const globals = {
    document: Object.assign(document, {
      documentElement: new CommunityNode('html'),
      createElement: (tag: string) => {
        nodesCreated++;
        return new MeterNode(tag);
      },
    }),
    window: host,
    location: new URL('https://0xdmme.app/'),
    MutationObserver: class {
      observe(): void {}
      disconnect(): void {}
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  t.mock.method(console, 'info', () => {});
  await import('../src/tools/chat-diagnostics/index.ts');
  const meter = host.__0xdmmeLag;
  assert.ok(meter);
  try {
    assert.equal(nodesCreated, 0);
    assert.equal(meter.report().active, true);
    meter.showPanel();
    meter.showPanel();
    assert.equal(document.body.children.length, 1);
    const panel = document.body.querySelector('aside');
    assert.ok(panel);
    const hide = panel.children.find(
      (node) => node.textContent === 'Hide controls',
    );
    assert.ok(hide);
    hide.click();
    assert.equal(document.body.children.length, 0);
    meter.mark();
    assert.equal(meter.report().active, true);
    assert.equal(meter.report().events.at(-1)?.kind, 'manual-marker');

    meter.showPanel();
    meter.hidePanel();
    assert.equal(document.body.children.length, 0);
    meter.showPanel();
    assert.equal(meter.stop().active, false);
    assert.equal(document.body.children.length, 0);
    meter.showPanel();
    assert.equal(document.body.children.length, 0);
  } finally {
    meter.stop();
  }
});
