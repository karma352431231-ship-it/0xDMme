import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { observeSubmissions } from '../src/tools/chat-diagnostics/submissions.ts';
import { Recording } from '../src/tools/chat-diagnostics/recording.ts';

class Control {
  disabled = false;
  hidden = false;
  readonly controls = new Map<string, Control>();
  readonly selector: string;
  private readonly parent: Control | null;
  constructor(selector: string, parent: Control | null = null) {
    this.selector = selector;
    this.parent = parent;
  }
  get value(): never {
    throw new Error('Diagnostic must not read draft content.');
  }
  get textContent(): never {
    throw new Error('Diagnostic must not read private DOM text.');
  }
  matches(selector: string): boolean {
    return this.selector === selector;
  }
  closest(selector: string): Control | null {
    return this.matches(selector)
      ? this
      : (this.parent?.closest(selector) ?? null);
  }
  querySelector(selector: string): Control | null {
    return this.controls.get(selector) ?? null;
  }
}

function fixture(t: TestContext) {
  const forms = new Map<string, Control>(),
    document = Object.assign(new EventTarget(), {
      documentElement: {},
      querySelector: (selector: string) => forms.get(selector) ?? null,
    });
  let notify = () => {},
    active = false;
  class Observer {
    constructor(callback: () => void) {
      notify = () => {
        if (active) callback();
      };
    }
    observe() {
      active = true;
    }
    disconnect() {
      active = false;
    }
  }
  const previous = ['document', 'Element', 'MutationObserver'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const [key, value] of Object.entries({
    document,
    Element: Control,
    MutationObserver: Observer,
  }))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const capture = new Recording(),
    stop = observeSubmissions(capture.record);
  t.after(stop);
  return {
    capture,
    stop,
    changed: () => notify(),
    form(selector: string) {
      const form = new Control(selector),
        text = new Control('textarea', form),
        send = new Control('[data-compose-send]', form);
      form.controls.set('textarea', text);
      form.controls.set('[data-compose-send]', send);
      forms.set(selector, form);
      notify();
      return { form, text, send };
    },
    emit(
      type: string,
      target: Control,
      keys: Record<string, string | boolean> = {},
    ) {
      const event = new Event(type, { cancelable: true });
      Object.defineProperty(event, 'target', { value: target });
      Object.assign(event, keys);
      document.dispatchEvent(event);
      assert.equal(event.defaultPrevented, false);
    },
    remove: (selector: string) => {
      forms.delete(selector);
      notify();
    },
  };
}

await test('send tracing distinguishes blocked Enter from actual submits in every chat without reading content', (t) => {
  const f = fixture(t);
  for (const [scope, selector] of [
    ['private', '[data-message-form]'],
    ['handle', '[data-public-compose]'],
    ['group', '[data-group-compose]'],
  ]) {
    const { form, text, send } = f.form(selector!);
    send.disabled = true;
    f.changed();
    f.emit('keydown', text, { key: 'Enter' });
    send.disabled = false;
    f.changed();
    f.emit('keydown', text, { key: 'Enter' });
    f.emit('click', send);
    f.emit('submit', form);
    const actions = f.capture
      .report()
      .events.filter(
        (event) => event.kind === 'send-action' && event.scope === scope,
      );
    assert.deepEqual(
      actions.map((event) => [event.cause, event.sendDisabled]),
      [
        ['enter', true],
        ['enter', false],
        ['button', false],
        ['submit', false],
      ],
    );
  }
  const count = f.capture.report().events.length;
  f.changed();
  assert.equal(
    f.capture.report().events.length,
    count,
    'Unchanged mutations must coalesce.',
  );
});

await test('send tracing ignores unrelated keys, Shift/IME and non-chat submits and stops all observation', (t) => {
  const f = fixture(t),
    { form, text } = f.form('[data-message-form]');
  const count = f.capture.report().events.length;
  f.emit('keydown', text, { key: 'private-key' });
  f.emit('keydown', text, { key: 'Enter', shiftKey: true });
  f.emit('keydown', text, { key: 'Enter', isComposing: true });
  f.emit('submit', new Control('unrelated-private-form'));
  assert.equal(f.capture.report().events.length, count);
  f.remove('[data-message-form]');
  assert.ok(
    f.capture
      .report()
      .events.some(
        (event) => event.scope === 'private' && event.present === false,
      ),
  );
  f.stop();
  const stopped = f.capture.report();
  f.emit('submit', form);
  f.changed();
  assert.deepEqual(f.capture.report(), stopped);
  assert.doesNotMatch(
    JSON.stringify(stopped),
    /private-key|unrelated-private-form/u,
  );
});
