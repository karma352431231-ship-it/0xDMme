import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { digest } from '../src/shared/devices/index.ts';
import type { privateNotificationDetails } from '../src/client/notification-private/index.ts';

// Exercise the actual detail builder and sender attribution; only encrypted
// readers and their device/storage lifecycle use already-verified local data.
const adapters = new Map([
  ['../devices/index.ts', ['BackgroundVaultAccess']],
  ['../vault-sync/index.ts', ['VaultSync']],
  ['../messages/index.ts', ['notificationMessages']],
  ['../groups/index.ts', ['readGroupNotification']],
  ['../contacts/index.ts', ['Contacts', 'AddressBook']],
]);
const bundle = await build({
  entryPoints: ['src/client/notification-private/index.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'privateDetails',
  plugins: [
    {
      name: 'verified-private-notification-readers',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path, importer }) =>
          importer.endsWith('/notification-private/index.ts') &&
          adapters.has(path)
            ? { path, namespace: 'fixture' }
            : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents: adapters
            .get(path)!
            .map((name) => `export const ${name} = fixture.${name};`)
            .join('\n'),
          loader: 'js',
        }));
      },
    },
  ],
});

await test('a private DM notification identifies the approved sender only in the title and keeps its message and photo', async () => {
  const peer = crypto.randomUUID();
  const session = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    expiresAt: '2027-01-01T00:00:00.000Z',
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Recipient',
    profileRevision: 0,
    deviceState: 'pending',
    historyAuthorized: false,
  };
  class LocalReader {
    close() {}
    setSession() {}
    read() {
      return Promise.resolve('The message alone');
    }
    profile() {
      return Promise.resolve({
        name: 'Private card name',
        photo: { type: 'image/png', bytes: new Uint8Array([1, 2, 3]) },
      });
    }
    approvedPeer() {
      return Promise.resolve({ accountId: peer });
    }
    aliasFor() {
      return Promise.resolve('Saved contact name');
    }
  }
  const context = {
    fixture: {
      BackgroundVaultAccess: LocalReader,
      VaultSync: LocalReader,
      Contacts: LocalReader,
      AddressBook: LocalReader,
      notificationMessages: () => new LocalReader(),
      readGroupNotification: () => {
        throw new Error('Unexpected group read.');
      },
    },
    crypto,
    TextEncoder,
    TextDecoder,
    Response,
    AbortSignal,
    Uint8Array,
    btoa,
    fetch: () => Promise.resolve(Response.json(session)),
    privateDetails: undefined as
      | { privateNotificationDetails: typeof privateNotificationDetails }
      | undefined,
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const details = await context.privateDetails!.privateNotificationDetails({
    candidates: [{ kind: 'direct', peer, id: crypto.randomUUID() }],
    scope: await digest(session.csrf),
    signal: new AbortController().signal,
  });
  assert.equal(details.length, 1);
  assert.equal(details[0]?.title, 'Saved contact name');
  assert.equal(details[0]?.body, 'The message alone');
  assert.equal(details[0]?.icon, 'data:image/png;base64,AQID');
});
