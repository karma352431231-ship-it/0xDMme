import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type * as Removals from '../src/client/personal-removals/index.ts';
import type { PersonalRemoval } from '../src/shared/backups/index.ts';
import { messageBody } from '../src/shared/messages/index.ts';
import {
  enqueueOutbox,
  localDelete,
  localGet,
  localPage,
  localPut,
  openLocal,
  outboxPage,
  removeOutbox,
  sealLocal,
} from '../src/client/message-storage/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';
import { recordDatabase } from './fixtures/record-database.ts';

const storage = {
  localDelete,
  localGet,
  localPage,
  localPut,
  openLocal,
  removeOutbox,
};
const bundle = await build({
  stdin: {
    contents:
      "export { RemovalIndex, cleanPersonal } from './src/client/personal-removals/index.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'removals',
  plugins: [
    {
      name: 'removal-io-boundaries',
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /^\.\.\/(message-storage|local-history|attachments|vault-storage|message-api)\/index\.ts$/,
          },
          ({ path, importer }) =>
            importer.endsWith('/personal-removals/index.ts')
              ? { path: path.split('/')[1]!, namespace: 'removal-fixture' }
              : undefined,
        );
        builder.onLoad(
          { filter: /.*/, namespace: 'removal-fixture' },
          ({ path }) => ({
            contents:
              path === 'message-storage'
                ? Object.keys(storage)
                    .map(
                      (name) =>
                        `export const ${name} = fixture.storage.${name};`,
                    )
                    .join('\n')
                : path === 'message-api'
                  ? 'export const messageApi = fixture.messageApi;'
                  : `export const ${path === 'local-history' ? 'forgetDmRecord' : path === 'attachments' ? 'forgetAttachment' : 'forgetCachedBlock'} = (...args) => fixture.purge(${JSON.stringify(path)}, ...args);`,
            loader: 'js',
          }),
        );
      },
    },
  ],
});

function fixture(t: TestContext) {
  const database = recordDatabase();
  for (const [key, value] of Object.entries({
    indexedDB: database.factory,
    IDBKeyRange: database.range,
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  let receipt: PersonalRemoval;
  const purged: unknown[][] = [];
  const context: Record<string, unknown> = {
    crypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    atob,
    btoa,
    fixture: {
      storage,
      purge: (...args: unknown[]) => {
        purged.push(args);
        return Promise.resolve();
      },
      messageApi: () =>
        Promise.resolve({
          status: 'cleaned',
          used: 0,
          released: 1,
          items: [receipt],
        }),
    },
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  return {
    api: context['removals'] as typeof Removals,
    purged,
    receipt: (value: PersonalRemoval) => {
      receipt = value;
    },
  };
}

async function signedRemoval(
  owner: Awaited<ReturnType<typeof groupParticipant>>,
  id: string,
): Promise<PersonalRemoval> {
  const target = { kind: 'dm-message' as const, id, hash: 'a'.repeat(64) };
  const proof = {
    deviceId: owner.deviceId,
    directory: owner.head,
    payload: { backup: 'b'.repeat(64), revision: 1, items: [target] },
    signature: '',
  };
  proof.signature = await owner.authority.sign(
    messageBody(owner.accountId, owner.deviceId, 'personal-clean', proof),
  );
  return { ...target, sequence: 1, proof };
}

await test('verified personal DM cleanup retires the durable text draft, FIFO and matching retained legacy capsule only', async (t) => {
  const f = fixture(t);
  const owner = await groupParticipant();
  const id = crypto.randomUUID(),
    other = crypto.randomUUID(),
    peer = crypto.randomUUID();
  const scope = `dm-text:${owner.accountId}:${owner.deviceId}`;
  const otherDevice = `dm-text:${owner.accountId}:${crypto.randomUUID()}`;
  const otherAccount = `dm-text:${crypto.randomUUID()}:${owner.deviceId}`;
  const deviceScope = `${owner.accountId}:${owner.deviceId}`;
  const legacyName = `dm-send:${peer}`;
  const cipher = await sealLocal(
    owner.authority,
    crypto.randomUUID(),
    JSON.stringify({ packet: { id }, text: 'Synthetic retained text' }),
  );
  await localPut(deviceScope, legacyName, cipher, cipher.bytes.length + 512);
  for (const [targetScope, targetId, extra] of [
    [scope, id, { legacyName }],
    [scope, other, {}],
    [otherDevice, id, {}],
    [otherAccount, id, {}],
  ] as const)
    await enqueueOutbox({
      scope: targetScope,
      id: targetId,
      value: { id: targetId, ...extra },
      size: 512,
      current: () => true,
    });
  const removal = await signedRemoval(owner, id);
  f.receipt(removal);
  await f.api.cleanPersonal(
    owner.authority,
    [removal],
    'b'.repeat(64),
    () => {},
  );
  assert.equal(await localGet(scope, `outbox:${id}`), null);
  assert.equal(await localGet(deviceScope, legacyName), null);
  assert.deepEqual(
    (await outboxPage<{ id: string }>(scope)).map((row) => row.value.id),
    [other],
  );
  assert.equal(
    await localGet(scope, 'usage'),
    640,
    'Deleted FIFO and ciphertext release their quota together.',
  );
  assert.ok(await localGet(otherDevice, `outbox:${id}`));
  assert.ok(await localGet(otherAccount, `outbox:${id}`));
  assert.deepEqual(f.purged, [
    ['local-history', owner.accountId, id],
    ['attachments', `dm-media:${owner.accountId}`, id],
  ]);
  const index = new f.api.RemovalIndex();
  await index.load({ ...owner.authority, offline: true }, () => {});
  assert.equal(index.has('dm-message', id), true);
  assert.equal(
    await localGet(scope, 'usage'),
    640,
    'Reopening a signed removal is idempotent.',
  );
});

await test('a mismatched or forged personal removal cannot delete a pending text or a newer retained peer draft', async (t) => {
  const f = fixture(t);
  const owner = await groupParticipant();
  const id = crypto.randomUUID(),
    peer = crypto.randomUUID();
  const scope = `dm-text:${owner.accountId}:${owner.deviceId}`;
  const deviceScope = `${owner.accountId}:${owner.deviceId}`;
  const legacyName = `dm-send:${peer}`;
  const cipher = await sealLocal(
    owner.authority,
    crypto.randomUUID(),
    JSON.stringify({
      packet: { id: crypto.randomUUID() },
      text: 'Newer retained draft',
    }),
  );
  await localPut(deviceScope, legacyName, cipher, cipher.bytes.length + 512);
  await enqueueOutbox({
    scope,
    id,
    value: { id, legacyName },
    size: 512,
    current: () => true,
  });
  const removal = await signedRemoval(owner, id);
  f.receipt({ ...removal, hash: 'c'.repeat(64) });
  await assert.rejects(
    f.api.cleanPersonal(owner.authority, [removal], 'b'.repeat(64), () => {}),
    /Receipt does not match/,
  );
  f.receipt({
    ...removal,
    proof: { ...removal.proof, signature: 'a'.repeat(128) },
  });
  await assert.rejects(
    f.api.cleanPersonal(owner.authority, [removal], 'b'.repeat(64), () => {}),
  );
  assert.ok(await localGet(scope, `outbox:${id}`));
  assert.equal(await localGet(scope, 'usage'), 640);
  assert.equal(f.purged.length, 0);
  f.receipt(removal);
  await f.api.cleanPersonal(
    owner.authority,
    [removal],
    'b'.repeat(64),
    () => {},
  );
  assert.equal(await localGet(scope, `outbox:${id}`), null);
  assert.ok(
    await localGet(deviceScope, legacyName),
    'A different authenticated packet at the same peer key is preserved.',
  );
});
