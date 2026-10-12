import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountPrivateProfile } from '../src/client/account/private-profile.ts';
import { createCore } from '../src/client/account/core.ts';
import { openProfile } from '../src/client/account-profile/index.ts';
import type { PrivateProfile } from '../src/client/account-profile/index.ts';

class PreferenceInput extends EventTarget {
  name = 'online';
  checked = false;
  value = '';
}
await test('perfil privado modular conserva foto e privacidade ativas até confirmar', async (t) => {
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
  const preferences = new EventTarget(),
    input = new PreferenceInput();
  const formNodes = new Map<string, unknown>([
    ['[data-preferences]', preferences],
    ['input[name="online"]', input],
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
    HTMLInputElement: PreferenceInput,
    document: {
      getElementById: () => null,
      querySelector: () => photoInput,
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
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(
      new Response('null', { headers: { 'Content-Type': 'application/json' } }),
    ),
  );
  const writes: PrivateProfile[] = [];
  let pending = Promise.resolve();
  const profile = new AccountPrivateProfile(
    core,
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
  input.checked = true;
  const change = new Event('change');
  Object.defineProperty(change, 'target', { value: input });
  preferences.dispatchEvent(change);
  await profile.selectPhoto();
  assert.equal(writes.length, 0);
  assert.equal(profile.privacyPreferences()?.online, false);
  assert.equal(profile.shared()?.photo, null);
  preferences.dispatchEvent(new Event('submit'));
  await pending;
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.preferences.online, true);
  assert.equal(profile.privacyPreferences()?.online, true);
  assert.ok(profile.shared()?.photo);
  assert.equal(core.session?.profileRevision, 1);
  assert.equal(profile.clean, true);
  profile.clear();
});
