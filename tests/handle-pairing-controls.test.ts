import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { PairingControls } from '../src/tools/chat-diagnostics/pairing-controls.ts';
import { CommunityNode } from './fixtures/community-dom.ts';
class MeterNode extends CommunityNode {
  style = { cssText: '' };
  readOnly = false;
  selected = false;
  onclick: (() => void) | null = null;
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
