import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from '../src/shared/account/index.ts';
import {
  canonical,
  digest,
  eventHash,
  profileProof,
  verify,
} from '../src/shared/devices/index.ts';
import {
  createIdentity,
  createRecovery,
  aesKey,
  newSecret,
} from '../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../src/client/device-operations/index.ts';
import {
  emptyProfile,
  sealProfile,
} from '../src/client/account-profile/index.ts';
import { DeviceController } from '../src/client/devices/controller.ts';

// Only the IndexedDB calls used for checkpoint transactions are modeled here.
// Real CryptoKey persistence and the complete flow are also exercised on Mac.
function checkpointDatabase(records: Map<string, unknown>): IDBFactory {
  return {
    open() {
      const opening: { result: unknown; onsuccess?: () => void } = {
        result: {
          close() {},
          transaction() {
            const transaction: {
              oncomplete?: () => void;
              abort: () => void;
              objectStore: () => unknown;
            } = {
              abort() {},
              objectStore: () => ({
                get(key: string) {
                  const request: { result: unknown; onsuccess?: () => void } = {
                    result: structuredClone(records.get(key)),
                  };
                  queueMicrotask(() => {
                    request.onsuccess?.();
                    transaction.oncomplete?.();
                  });
                  return request;
                },
                put(value: unknown, key: string) {
                  records.set(key, structuredClone(value));
                },
              }),
            };
            return transaction;
          },
        },
      };
      queueMicrotask(() => opening.onsuccess?.());
      return opening;
    },
  } as unknown as IDBFactory;
}

await test('perfil em edição não pode ser salvo com chave anterior depois de revogação observada', async (t) => {
  const accountId = crypto.randomUUID();
  const owner = await createIdentity(crypto.randomUUID(), 'Mac');
  const revoked = await createIdentity(crypto.randomUUID(), 'Revogado');
  const recovery = await createRecovery(accountId, newSecret());
  const oldRing = freshKeyring(accountId);
  const initial = await prepareEvent({
    accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: recovery.signing,
    root: recovery.root,
    identities: [owner.public],
    ring: oldRing,
    profile: null,
  });
  const linked = await prepareEvent({
    accountId,
    previous: initial,
    kind: 'link',
    signer: owner.public.id,
    signing: owner.signing,
    root: recovery.root,
    identities: [owner.public, revoked.public],
    ring: oldRing,
    linkId: crypto.randomUUID(),
    profile: null,
  });
  const ring = freshKeyring(accountId, oldRing);
  const current = await prepareEvent({
    accountId,
    previous: linked,
    kind: 'revoke',
    signer: owner.public.id,
    signing: owner.signing,
    root: recovery.root,
    identities: [owner.public],
    ring,
    profile: null,
  });
  const head = await eventHash(current);
  const records = new Map<string, unknown>([
    [
      `checkpoint:${accountId}`,
      {
        events: [initial, linked, current],
        trustedRoot: await digest(canonical(recovery.root)),
      },
    ],
  ]);
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: checkpointDatabase(records),
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'indexedDB'));
  const session: AccountSession = {
    accountId,
    deviceId: owner.public.id,
    csrf: 'a'.repeat(64),
    ecosystem: 'evm',
    address: `0x${'1'.repeat(40)}`,
    name: '',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    profileRevision: 0,
    historyAuthorized: false,
    deviceState: 'pending',
  };
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests.push(url);
    if (url.endsWith('/devices/read'))
      return Response.json({
        events: [],
        revision: current.revision,
        head,
        serverTime: new Date().toISOString(),
      });
    assert.ok(url.endsWith('/devices/profile'));
    assert.equal(typeof init.body, 'string');
    const body = JSON.parse(init.body as string) as {
      head: string;
      profile: unknown;
      signature: string;
    };
    assert.equal(body.head, head);
    await verify(
      owner.public.signing,
      body.signature,
      profileProof(accountId, owner.public.id, head, body.profile),
    );
    return Response.json({ status: 'saved' });
  });
  const controller = new DeviceController();
  controller.setSession(session);
  controller.current = current;
  controller.identity = owner;
  controller.ring = ring;
  const oldProfile = await sealProfile({
    accountId,
    revision: 1,
    key: await aesKey(oldRing.keys[0] ?? ''),
    profile: emptyProfile(),
  });
  await assert.rejects(
    controller.saveProfile(session, oldProfile, oldRing.epoch),
    /Dispositivos alterados/,
  );
  assert.deepEqual(requests, ['/api/account/devices/read']);
  const profile = await sealProfile({
    accountId,
    revision: 1,
    key: await aesKey(ring.keys[1] ?? ''),
    profile: emptyProfile(),
  });
  await controller.saveProfile(session, profile, ring.epoch);
  assert.equal(requests.at(-1), '/api/account/devices/profile');
  await assert.rejects(
    controller.saveProfile(
      { ...session, deviceId: crypto.randomUUID() },
      profile,
      ring.epoch,
    ),
    /Sessão alterada/,
  );
  assert.equal(requests.length, 3);
  await t.test(
    'recuperação com lista desatualizada exige nova conferência antes de alterar chaves',
    async () => {
      const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          locks: {
            request: (
              _name: string,
              _options: unknown,
              work: () => Promise<unknown>,
            ) => work(),
          },
        },
      });
      try {
        const recovering = new DeviceController();
        recovering.setSession({ ...session, deviceId: crypto.randomUUID() });
        const before = requests.length;
        await assert.rejects(
          recovering.recover({
            secret: newSecret(),
            name: 'Novo',
            revoked: [owner.public.id],
            revision: initial.revision,
          }),
          /lista de aparelhos mudou/,
        );
        assert.deepEqual(requests.slice(before), ['/api/account/devices/read']);
        assert.equal(recovering.current?.revision, current.revision);
        assert.equal(recovering.identity, null);
      } finally {
        if (original) Object.defineProperty(globalThis, 'navigator', original);
        else Reflect.deleteProperty(globalThis, 'navigator');
      }
    },
  );
});
