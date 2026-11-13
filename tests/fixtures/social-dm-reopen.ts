import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { recordDatabase } from './record-database.ts';
import {
  sealLocal,
  localPutWithin,
} from '../../src/client/message-storage/index.ts';
import type { SocialDms } from '../../src/client/social-dm/index.ts';
import type {
  VaultAuthority,
  VaultAccess,
} from '../../src/client/vault-authority/index.ts';
import type { VaultSync } from '../../src/client/vault-sync/index.ts';
import type { BackupRecord } from '../../src/client/backup-records/index.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';

const bundle = await build({
  stdin: {
    contents: "export { SocialDms } from './src/client/social-dm/index.ts';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'socialReopen',
  define: {
    'import.meta.url': '"https://0xdmme.app/synthetic.js"',
    ATTACHMENT_WORKER_URL: '"/unused"',
  },
  plugins: [
    {
      name: 'synthetic-dm-history-io',
      setup(builder) {
        builder.onResolve(
          { filter: /^\.\.\/local-history\/index\.ts$/ },
          ({ path, importer }) =>
            importer.includes('/social-dm/')
              ? { path, namespace: 'history' }
              : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: 'history' }, () => ({
          contents: [
            'historyRecord',
            'cacheDmRecord',
            'dmConversationHistory',
            'dmHistoryPeers',
            'searchDmHistory',
            'forgetDmRecord',
            'relatedDmHistory',
          ]
            .map((name) => `export const ${name} = fixture.${name};`)
            .join('\n'),
          loader: 'js',
        }));
      },
    },
  ],
});
/** Real public-handle controller, cursor, encrypted accelerator, authority and
 * final checks. Only remote transport and the independent historical IO adapt. */
export async function socialReopenFixture() {
  const store = recordDatabase(),
    key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  const session: AccountSession = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    expiresAt: '2027-01-01T00:00:00Z',
    address: `0x${'1'.repeat(40)}`,
    ecosystem: 'evm',
    name: 'Synthetic',
    profileRevision: 0,
    deviceState: 'pending',
    historyAuthorized: false,
  };
  const authority: VaultAuthority = {
    session,
    directory: 'a'.repeat(64),
    epoch: 1,
    events: [],
    offline: false,
    key: () => Promise.resolve(key),
    sign: () => Promise.resolve('synthetic'),
  };
  const snapshot = {
    anchor: 1,
    removals: 0,
    directory: 'b'.repeat(64),
    profile: crypto.randomUUID(),
  };
  const peer = {
    id: crypto.randomUUID(),
    handle: 'synthetic_peer',
    avatar: null,
  };
  const data = {
    records: [
      {
        type: 'dm-message',
        id: crypto.randomUUID(),
        hash: 'c'.repeat(64),
        self: snapshot.profile,
        peer,
        sequence: 1,
        own: false,
        kind: 'text',
        media: null,
        text: 'Synthetic public conversation',
      },
    ] as Extract<BackupRecord, { type: 'dm-message' }>[],
    historyReads: 0,
    requests: [] as string[],
    denied: false,
    onConfirmation: undefined as (() => void) | undefined,
  };
  const fixture = {
    historyRecord: () => Promise.resolve(null),
    cacheDmRecord: () => Promise.resolve(),
    dmConversationHistory: () => {
      data.historyReads++;
      return Promise.resolve(data.records);
    },
    relatedDmHistory: () => Promise.resolve([]),
    dmHistoryPeers: () => Promise.resolve({ items: [], next: null }),
    searchDmHistory: () => Promise.resolve({ items: [], next: null }),
    forgetDmRecord: () => Promise.resolve(),
  };
  const context = {
    crypto,
    btoa,
    atob,
    fixture,
    indexedDB: store.factory,
    IDBKeyRange: store.range,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    URL,
    Response,
    Error,
    DOMException,
    setTimeout,
    clearTimeout,
    navigator: { onLine: true },
    fetch: (_url: unknown, init: RequestInit) => {
      const operation = String(_url).split('/').at(-1)!;
      void init;
      data.requests.push(operation);
      if (data.denied)
        return Promise.resolve(
          Response.json({ error: 'Access denied.' }, { status: 403 }),
        );
      if (operation === 'dm-personal-snapshot') {
        data.onConfirmation?.();
        return Promise.resolve(Response.json(snapshot));
      }
      if (operation === 'dm-message-status')
        return Promise.resolve(Response.json([]));
      throw new Error(`Unexpected synthetic request ${operation}`);
    },
    socialReopen: undefined as { SocialDms: typeof SocialDms } | undefined,
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const access: VaultAccess = {
    withVault: (offline, work) => work({ ...authority, offline }),
    withLocalVault: (_locator, work) => work({ ...authority, offline: true }),
  };
  const create = () => {
    const controller = new context.socialReopen!.SocialDms(
      access,
      {} as VaultSync,
    );
    controller.setSession(session);
    return controller;
  };
  const seedCursor = async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: store.factory,
    });
    try {
      const row = await sealLocal(
        authority,
        crypto.randomUUID(),
        JSON.stringify({ ...snapshot, version: 4, after: snapshot.anchor }),
      );
      await localPutWithin({
        scope: `${session.accountId}:${session.deviceId}`,
        name: 'dm-sync-state',
        value: row,
        size: row.bytes.length + 512,
        maximum: 1_000_000_000,
      });
    } finally {
      if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
      else Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  };
  await seedCursor();
  return { create, session, authority, snapshot, peer, data, seedCursor };
}
