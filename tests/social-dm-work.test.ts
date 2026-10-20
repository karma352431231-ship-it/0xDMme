import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { SocialDms } from '../src/client/social-dm/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
  VaultWorkOptions,
} from '../src/client/vault-authority/index.ts';
import type { VaultSync } from '../src/client/vault-sync/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';

// Retain the actual controller, signed API, history cursor and removal gates.
// Only local storage is synthetic; this is scheduling, not crypto/durability QA.
const storageNames = [
  'localGet',
  'localPut',
  'localPutWithin',
  'localDelete',
  'localPage',
  'localPrevious',
  'sealLocal',
  'openLocal',
  'localStoreKey',
  'enqueueOutbox',
  'outboxPage',
  'removeOutbox',
];
const historySource = await readFile(
  'src/client/local-history/index.ts',
  'utf8',
);
const historyNames = [
  ...historySource.matchAll(/^export (?:async )?function (\w+)/gmu),
].map((match) => match[1]!);
const bundle = await build({
  entryPoints: ['src/client/social-dm/index.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'dm',
  define: {
    'import.meta.url': '"https://0xdmme.app/synthetic.js"',
    ATTACHMENT_WORKER_URL: '"/unused"',
  },
  plugins: [
    {
      name: 'local-dm-storage',
      setup(builder) {
        builder.onResolve(
          { filter: /^\.\.\/(message-storage|local-history)\/index\.ts$/ },
          ({ path }) => ({ path, namespace: 'storage' }),
        );
        builder.onLoad({ filter: /.*/, namespace: 'storage' }, ({ path }) => ({
          contents: (path.includes('message-storage')
            ? storageNames
            : historyNames
          )
            .map((name) => `export const ${name} = fixture.${name};`)
            .join('\n'),
          loader: 'js',
        }));
      },
    },
  ],
});

for (const interactive of [false, true])
  await test(`handle history keeps its requested priority through signed snapshots, cursor persistence and local projection: interactive=${interactive}`, async () => {
    const session = {
      accountId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      csrf: 'a'.repeat(64),
    } as AccountSession;
    const profile = crypto.randomUUID();
    const snapshot = {
      profile,
      anchor: 0,
      removals: 0,
      directory: 'b'.repeat(64),
    };
    const boundaries: {
      offline: boolean;
      priority: VaultWorkOptions['priority'];
    }[] = [];
    const requests: string[] = [],
      stored = new Map<string, unknown>();
    const authority: VaultAuthority = {
      session,
      offline: false,
      directory: snapshot.directory,
      epoch: 1,
      events: [],
      sign: () => Promise.resolve('test-signature'),
      key: () => Promise.reject(new Error('No test key.')),
    };
    const access: VaultAccess = {
      withVault: (offline, work, options) => {
        boundaries.push({ offline, priority: options?.priority });
        return work({ ...authority, offline });
      },
      withLocalVault: (_locator, work) => work({ ...authority, offline: true }),
    };
    const empty = () => Promise.resolve([]);
    const fixture: Record<string, unknown> = {
      dmConversationHistory: empty,
      relatedDmHistory: empty,
      localGet: (_scope: string, name: string) =>
        Promise.resolve(stored.get(name) ?? null),
      localPut: (_scope: string, name: string, value: unknown) => {
        stored.set(name, value);
        return Promise.resolve();
      },
      localPage: () => Promise.resolve({ items: [], next: null }),
      sealLocal: (_a: unknown, id: string, text: string) =>
        Promise.resolve({ id, text, bytes: new Uint8Array(1) }),
      openLocal: (_a: unknown, row: { text: string }) =>
        Promise.resolve(row.text),
    };
    const context = runInNewContext(bundle.outputFiles[0]!.text + '\ndm;', {
      fixture,
      crypto,
      TextEncoder,
      TextDecoder,
      AbortController,
      AbortSignal,
      DOMException,
      URL,
      Response,
      Error,
      setTimeout,
      clearTimeout,
      navigator: { onLine: true },
      fetch: (path: string) => {
        requests.push(path);
        return Promise.resolve(Response.json(snapshot));
      },
    }) as { SocialDms: typeof SocialDms };
    const controller = new context.SocialDms(access, {} as VaultSync);
    controller.setSession(session);
    const page = await controller.read(
      profile,
      null,
      interactive ? { priority: 'interactive' } : {},
    );
    assert.equal(page.items.length, 0);
    assert.equal(stored.has('dm-sync-state'), true);
    assert.deepEqual(requests, [
      '/api/account/messages/dm-personal-snapshot',
      '/api/account/messages/dm-personal-snapshot',
    ]);
    assert.equal(
      boundaries.length,
      5,
      'Two signed reads, local cursor read/write and projection keep separate authority boundaries',
    );
    for (const boundary of boundaries)
      assert.equal(boundary.priority, interactive ? 'interactive' : undefined);
    assert.equal(boundaries.at(-1)?.offline, true);
    const previous = boundaries.length;
    await controller.directoryPreviews([profile]);
    assert.ok(
      boundaries
        .slice(previous)
        .every((boundary) => boundary.priority === undefined),
      'Directory preparation must not inherit a selected conversation priority',
    );
    const received = requests.length;
    await controller.receive();
    assert.deepEqual(requests.slice(received), [
      '/api/account/messages/dm-personal-snapshot',
      '/api/account/messages/dm-personal-snapshot',
    ]);
  });
