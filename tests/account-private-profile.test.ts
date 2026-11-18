import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountPrivateProfile } from '../src/client/account/private-profile.ts';
import { createCore } from '../src/client/account/core.ts';
import { openProfile } from '../src/client/account-profile/index.ts';
import type { PrivateProfile } from '../src/client/account-profile/index.ts';

class ReminderSwitch extends EventTarget {
  checked = false;
  disabled = false;
}
await test('the private photo and the backup reminder save at once while the name draft stays', async (t) => {
  const core = createCore();
  core.session = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    ecosystem: 'evm',
    address: '0x' + 'a'.repeat(40),
    name: 'Nome salvo',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    csrf: 'csrf-sintetico',
    profileRevision: 0,
  };
  const current = core.session,
    key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  const reminder = new ReminderSwitch(),
    nameForm = new EventTarget(),
    nameInput = { value: 'Nome salvo' };
  const reminderHost = {
    innerHTML: '',
    querySelector: (selector: string) =>
      selector === '[data-backup-reminder]' ? reminder : null,
  } as unknown as HTMLElement;
  const formNodes = new Map<string, unknown>([
    ['[data-name-form]', nameForm],
    ['input[name="display-name"]', nameInput],
  ]);
  core.mounted = {
    querySelector: (selector: string) => formNodes.get(selector) ?? null,
  } as unknown as HTMLElement;
  const photoInput = {
    files: [
      new File(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
        'avatar.png',
        { type: 'image/png' },
      ),
    ],
  };
  const globals: Record<string, unknown> = {
    window: new EventTarget(),
    document: {
      getElementById: () => null,
      querySelector: () => photoInput,
      querySelectorAll: () => [],
      activeElement: null,
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
  const requested: string[] = [];
  t.mock.method(globalThis, 'fetch', (url: string) => {
    requested.push(url);
    return Promise.resolve(
      new Response('null', { headers: { 'Content-Type': 'application/json' } }),
    );
  });
  const writes: PrivateProfile[] = [];
  let pending = Promise.resolve();
  const profile = new AccountPrivateProfile(
    {
      read: () => ({
        session: core.session,
        status: core.status,
        busy: core.busy,
        epoch: core.epoch,
        disposed: core.disposed,
        mounted: core.mounted,
      }),
      notice: (message) => {
        core.status = message;
      },
      profileNotice: (message) => {
        core.profileStatus = message;
      },
      withBusy: async (work) => {
        core.busy = true;
        try {
          return await work();
        } finally {
          core.busy = false;
        }
      },
    },
    {
      privateKey: () => Promise.resolve(key),
      saveProfile: async (_session, envelope) => {
        writes.push(
          await openProfile({ envelope, key, accountId: current.accountId }),
        );
      },
    },
    {
      setSession: (session) => {
        core.session = session;
      },
      render: () => {},
      renderSidebar: () => {},
      operation: (work) => {
        pending = work();
        return pending;
      },
    },
  );
  await profile.load(current);
  profile.bind();
  profile.mountReminder(reminderHost);
  assert.equal(reminder.checked, false);
  assert.equal(reminder.disabled, false);
  await profile.selectPhoto();
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.preferences.backupReminder, false);
  assert.equal(profile.backupReminder(), false);
  assert.ok(profile.shared()?.photo);
  assert.equal(core.session?.profileRevision, 1);
  assert.equal(profile.clean, true, 'a saved photo leaves no draft');
  nameInput.value = 'Nome em rascunho';
  nameForm.dispatchEvent(new Event('input'));
  reminder.checked = true;
  reminder.dispatchEvent(new Event('change'));
  await pending;
  assert.equal(writes.length, 2);
  assert.equal(writes[1]?.preferences.backupReminder, true);
  assert.equal(profile.backupReminder(), true);
  assert.ok(profile.shared()?.photo);
  assert.equal(core.session?.profileRevision, 2);
  assert.ok(
    !requested.some((url) => url.endsWith('/name')),
    'the reminder switch must not confirm the drafted name',
  );
  assert.equal(core.session?.name, 'Nome salvo');
  assert.equal(profile.clean, false, 'the name draft remains unsaved');
  profile.clear();
});
