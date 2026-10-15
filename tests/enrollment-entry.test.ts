import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startEnrollmentEntry } from '../src/client/devices/enrollment-entry.ts';
import { enrollmentUrl } from '../src/shared/device-enrollment/index.ts';

class Control extends EventTarget {
  textContent = '';
  disabled = false;
  hidden = false;
}
class Dialog extends EventTarget {
  className = '';
  innerHTML = '';
  removed = false;
  open = false;
  controls = new Map(
    [
      '[data-enrollment-confirm]',
      '[data-enrollment-close]',
      '[data-enrollment-status]',
      'h2',
    ].map((key) => [key, new Control()]),
  );
  querySelector(key: string): Control | null {
    return this.controls.get(key) ?? null;
  }
  showModal(): void {
    this.open = true;
  }
  close(): void {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
  remove(): void {
    this.removed = true;
  }
}
await test('QR abre confirmação sem autenticar; consentimento conecta e remove capacidade da URL', async (t) => {
  const origin = 'https://0xdmme.app';
  const code = {
    version: 1 as const,
    id: crypto.randomUUID(),
    accountId: crypto.randomUUID(),
    root: 'a'.repeat(64),
    secret: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  };
  const link = enrollmentUrl(code, origin),
    location = { origin, href: link, hash: new URL(link).hash };
  const dialogs: Dialog[] = [],
    alerts: string[] = [];
  const window = Object.assign(new EventTarget(), {
    alert: (message: string) => alerts.push(message),
  });
  const globals = {
    window,
    location,
    history: {
      replaceState: (_state: unknown, _title: string, hash: string) => {
        location.hash = hash;
      },
    },
    document: {
      createElement: () => new Dialog(),
      body: { append: (dialog: Dialog) => dialogs.push(dialog) },
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  let joins = 0;
  const state = {
    waiting: false,
    authorized: false,
    message: '',
    failed: false,
  };
  startEnrollmentEntry({
    enroll: () => {
      joins++;
      state.waiting = true;
      state.message = 'Aguardando origem';
      return Promise.resolve();
    },
    enrollmentState: () => state,
  });
  assert.equal(joins, 0);
  assert.equal(location.hash, '#settings');
  const dialog = dialogs[0]!;
  assert.equal(dialog.open, true);
  dialog
    .querySelector('[data-enrollment-confirm]')!
    .dispatchEvent(new Event('click'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(joins, 1);
  assert.equal(
    dialog.querySelector('[data-enrollment-status]')!.textContent,
    'Aguardando origem',
  );
  state.waiting = false;
  state.authorized = true;
  window.dispatchEvent(new Event('0xdmme-device-status'));
  assert.equal(
    dialog.querySelector('h2')!.textContent,
    'Successfully connected',
  );
  assert.equal(dialog.querySelector('[data-enrollment-confirm]')!.hidden, true);
  dialog
    .querySelector('[data-enrollment-close]')!
    .dispatchEvent(new Event('click'));
  assert.equal(dialog.removed, true);
  location.href = enrollmentUrl(code, 'https://other.example');
  location.hash = new URL(location.href).hash;
  window.dispatchEvent(new Event('hashchange'));
  assert.equal(location.hash, '#settings');
  assert.equal(alerts.length, 1);
  assert.equal(joins, 1);
});
