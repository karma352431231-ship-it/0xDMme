import { deferred, waitForBoundary } from './fixtures/deferred.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { observeSubmissions } from '../src/tools/chat-diagnostics/submissions.ts';
import { Recording } from '../src/tools/chat-diagnostics/recording.ts';

class Control {
  disabled = false;
  hidden = false;
  files: FileList | null = null;
  readonly attributes = new Map<string, string>();
  readonly tiles: Control[] = [];
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
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  querySelectorAll(selector: string): Control[] {
    return selector === '.attachment-tile' ? this.tiles : [];
  }
  querySelector(selector: string): Control | null {
    return this.controls.get(selector) ?? null;
  }
}

class DiagnosticFileReader {
  result: ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private cancelled = false;
  abort(): void {
    this.cancelled = true;
    this.onerror?.();
  }
  readAsArrayBuffer(file: File): void {
    void file.arrayBuffer().then(
      (bytes) => {
        if (this.cancelled) return;
        this.result = bytes;
        this.onload?.();
      },
      () => this.onerror?.(),
    );
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
  const previous = [
    'document',
    'Element',
    'MutationObserver',
    'FileReader',
  ].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const [key, value] of Object.entries({
    document,
    Element: Control,
    MutationObserver: Observer,
    FileReader: DiagnosticFileReader,
  }))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const inspected = deferred<void>();
  const capture = new Recording(),
    stop = observeSubmissions((kind, data) => {
      capture.record(kind, data);
      if (kind === 'attachment-inspected') inspected.resolve();
    });
  t.after(stop);
  return {
    capture,
    inspected: inspected.promise,
    stop,
    changed: () => notify(),
    form(selector: string) {
      const form = new Control(selector),
        text = new Control('textarea', form),
        send = new Control('[data-compose-send]', form);
      const file = new Control('[data-attachment-file]', form),
        clear = new Control('[data-attachment-clear]', form);
      clear.hidden = true;
      form.controls.set('[data-attachment-file]', file);
      form.controls.set('[data-attachment-clear]', clear);
      form.controls.set('textarea', text);
      form.controls.set('[data-compose-send]', send);
      forms.set(selector, form);
      notify();
      return { form, text, send, file, clear };
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
  // Observation stopped, not the recording: its clock keeps running, so only
  // the events must stay unchanged.
  assert.deepEqual(f.capture.report().events, stopped.events);
  assert.doesNotMatch(
    JSON.stringify(stopped),
    /private-key|unrelated-private-form/u,
  );
});

await test('normal typing and file choice automatically classify sends and deduplicate Enter/click/submit', async (t) => {
  const f = fixture(t);
  const { form, text, send, file, clear } = f.form('[data-message-form]');
  f.emit('keydown', text, { key: 'Enter' });
  f.emit('click', send);
  f.emit('submit', form);
  assert.equal(f.capture.report().comparison.sends.length, 1);
  assert.equal(f.capture.report().comparison.sends[0]?.label, 'text');
  f.capture.record('manual-marker');
  await Promise.resolve();
  const selected = new File([new Uint8Array(42)], 'synthetic-video', {
    type: 'video/mp4',
  });
  Object.defineProperty(selected, 'name', {
    get: () => {
      throw new Error('Filename must stay unread.');
    },
  });
  file.files = { length: 1, item: () => selected } as unknown as FileList;
  form.attributes.set('data-view-once', 'true');
  f.emit('change', file);
  assert.equal(
    f.capture.report().comparison.sends.length,
    1,
    'Selection alone is not a send.',
  );
  clear.hidden = false;
  f.emit('click', send);
  f.emit('submit', form);
  const summary = f.capture.report().comparison.sends[1]!;
  assert.equal(summary.label, 'view-once-video');
  assert.equal(summary.fileBytes, 42);
  assert.equal(summary.fileCount, 1);
  assert.equal(f.capture.report().comparison.sends.length, 2);
  f.capture.record('manual-marker');
  await Promise.resolve();
  f.emit('click', clear);
  clear.hidden = true;
  form.attributes.set('data-view-once', 'false');
  await Promise.resolve();
  f.emit('submit', form);
  assert.equal(f.capture.report().comparison.sends[2]?.label, 'text');
});

await test('a preexisting attachment is explicit unknown and blocked sends allocate no summary', (t) => {
  const f = fixture(t),
    { form, send, clear } = f.form('[data-message-form]');
  send.disabled = true;
  f.emit('click', send);
  assert.equal(f.capture.report().comparison.sends.length, 0);
  send.disabled = false;
  clear.hidden = false;
  f.emit('submit', form);
  assert.equal(
    f.capture.report().comparison.sends[0]?.label,
    'ordinary-unknown',
  );
});

await test('a text send after an inspected attachment cannot inherit file identity or inspection state', async (t) => {
  const f = fixture(t),
    { form, file, clear, send } = f.form('[data-public-compose]');
  const selected = new File(
    [new Uint8Array([255, 216, 255, 0])],
    'synthetic-image',
    { type: 'image/jpeg' },
  );
  file.files = { length: 1, item: () => selected } as unknown as FileList;
  f.emit('change', file);
  clear.hidden = false;
  await waitForBoundary(f.inspected);
  f.emit('click', send);
  await Promise.resolve();
  assert.equal(f.capture.report().comparison.sends[0]?.fileSlots.length, 1);
  // The application clears its composer programmatically after submission.
  clear.hidden = true;
  f.emit('click', send);
  f.emit('submit', form);
  const text = f.capture.report().comparison.sends[1]!;
  assert.equal(text.label, 'text');
  assert.equal(text.selection, 0);
  assert.deepEqual(text.fileSlots, []);
  assert.equal(text.inspectedFiles, 0);
  assert.equal(text.signatureFiles, 0);
  assert.equal(text.inspectionPending, false);
  assert.equal(text.fileBytes, 0);
});
