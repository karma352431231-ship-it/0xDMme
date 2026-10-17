import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  currentLanguage,
  setActiveLanguage,
  t,
} from '../src/shared/i18n/index.ts';
import type { AppLanguage } from '../src/shared/i18n/index.ts';
import { socialDirectory } from '../src/shared/social-dm/index.ts';
import { verify, verifyHistory } from '../src/shared/devices/index.ts';
import type { DirectoryEvent } from '../src/shared/devices/index.ts';
import { newSecret } from '../src/client/device-keys/index.ts';
import {
  localIdentity,
  storedIdentity,
} from '../src/client/device-storage/index.ts';
import { socialAuthority } from '../src/client/social-dm/authority.ts';
import type { SocialApi } from '../src/client/social-dm/authority.ts';
import type { VaultAuthority } from '../src/client/vault-authority/index.ts';
import { deviceDatabase } from './fixtures/device-database.ts';

const privateAuthority: VaultAuthority = {
  session: {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
  },
  offline: false,
  directory: 'b'.repeat(64),
  epoch: 1,
  events: [],
  key: () => Promise.reject(new Error('Não usa chaves privadas nas DMs.')),
  sign: () => Promise.reject(new Error('Não assina com a identidade privada.')),
};

/** The API applies the same context guard as dm-register, with real signatures. */
function registrationApi(profile: string, events: DirectoryEvent[]): SocialApi {
  return async (operation, payload) => {
    assert.equal(operation, 'register');
    const event = socialDirectory(payload['event']);
    assert.ok(await verifyHistory([...events, event], profile));
    events.push(event);
    return { status: 'saved' };
  };
}

async function assertHistoryReadable(
  original: VaultAuthority,
  reopened: VaultAuthority,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    plaintext = new TextEncoder().encode('DM sintética');
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await original.key(1),
    plaintext,
  );
  assert.deepEqual(
    new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        await reopened.key(1),
        ciphertext,
      ),
    ),
    plaintext,
  );
}

await test('autoridade das DMs registra em ambos os idiomas e preserva identidades locais de tentativas recusadas', async (context) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB'),
    language = currentLanguage();
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: deviceDatabase(),
  });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, 'indexedDB', original);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
    setActiveLanguage(language);
  });
  for (const language of ['en', 'zh-CN'] satisfies AppLanguage[]) {
    for (const cached of [false, true]) {
      await context.test(
        `${language}: ${cached ? 'identidade traduzida já salva' : 'primeiro registro'}`,
        async () => {
          setActiveLanguage(language);
          const profile = crypto.randomUUID(),
            alias = crypto.randomUUID(),
            secret = newSecret(),
            events: DirectoryEvent[] = [];
          const before = cached
            ? await localIdentity(profile, alias, t('Aparelho de DMs'))
            : null;
          const authority = await socialAuthority({
            privateAuthority,
            directory: { profile, events: [], device: null, active: [] },
            secret,
            alias,
            api: registrationApi(profile, events),
          });
          assert.equal(events.length, 1);
          const identity = await storedIdentity(profile, alias);
          assert.equal(identity.public.name, 'Aparelho de DMs');
          if (before)
            assert.deepEqual(identity.public, {
              ...before.public,
              name: 'Aparelho de DMs',
            });
          await verify(
            identity.public.signing,
            await authority.sign('prova sintética'),
            'prova sintética',
          );
          const reopened = await socialAuthority({
            privateAuthority,
            directory: { profile, events, device: alias, active: [alias] },
            secret,
            alias,
            api: () => Promise.reject(new Error('Diretório já registrado.')),
          });
          await assertHistoryReadable(authority, reopened);
          assert.equal(reopened.directory, authority.directory);
          const wire = JSON.stringify(events);
          assert.equal(
            wire.includes(privateAuthority.session.accountId),
            false,
          );
          assert.equal(wire.includes(privateAuthority.session.deviceId), false);
        },
      );
    }
  }
  for (const collision of [false, true]) {
    await context.test(
      `recuperação ${collision ? 'com colisão de alias' : 'com identidade traduzida salva'}`,
      async () => {
        const profile = crypto.randomUUID(),
          firstAlias = crypto.randomUUID(),
          secret = newSecret(),
          events: DirectoryEvent[] = [],
          api = registrationApi(profile, events);
        const original = await socialAuthority({
          privateAuthority,
          directory: { profile, events: [], device: null, active: [] },
          secret,
          alias: firstAlias,
          api,
        });
        const initial = JSON.stringify(events);
        // A separate browser has different keys, possibly with a stale alias.
        Object.defineProperty(globalThis, 'indexedDB', {
          configurable: true,
          value: deviceDatabase(),
        });
        setActiveLanguage(collision ? 'zh-CN' : 'en');
        const alias = collision ? firstAlias : crypto.randomUUID(),
          before = await localIdentity(profile, alias, t('Aparelho de DMs'));
        const recovered = await socialAuthority({
          privateAuthority,
          directory: {
            profile,
            events: [...events],
            device: collision ? firstAlias : null,
            active: [firstAlias],
          },
          secret,
          alias,
          api,
        });
        assert.equal(events.length, 2);
        assert.equal(events.at(-1)?.kind, 'recover');
        assert.equal(recovered.epoch, 2);
        assert.equal(JSON.stringify(events.slice(0, 1)), initial);
        const identity = await storedIdentity(
          profile,
          recovered.session.deviceId,
        );
        assert.equal(identity.public.name, 'Aparelho de DMs');
        if (collision) assert.notEqual(identity.public.id, firstAlias);
        else
          assert.deepEqual(identity.public, {
            ...before.public,
            name: 'Aparelho de DMs',
          });
        await assertHistoryReadable(original, recovered);
      },
    );
  }
});
