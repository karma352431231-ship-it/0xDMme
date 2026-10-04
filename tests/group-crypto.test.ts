import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initAsync } from '@matrix-org/matrix-sdk-crypto-wasm';
import { MessageCrypto } from '../src/client/message-crypto/index.ts';
import type { MessageTransport } from '../src/client/message-crypto/index.ts';
import {
  createRecoveryKey,
  openRecoveryKey,
  openRoomKey,
} from '../src/client/message-recovery/index.ts';
import { groupEventHash, groupEventProof } from '../src/shared/groups/index.ts';
import type { GroupEvent } from '../src/shared/groups/index.ts';
import { canonical, digest, sign } from '../src/shared/devices/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';
import { GroupCache } from '../src/client/groups/cache.ts';
import { readGroupPage } from '../src/client/groups/reader.ts';
import { PeerIdentity } from '../src/client/peer-identity/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';

// No recipient has initialized a Matrix device here. This deliberately exercises
// the real SDK recovery path used by offline members and newly recovered devices.
const recoveryOnlyTransport: MessageTransport = (operation) => {
  if (operation === 'matrix-upload')
    return Promise.resolve({
      response: { one_time_key_counts: { signed_curve25519: 50 } },
    });
  if (operation === 'matrix-query')
    return Promise.resolve({
      response: { device_keys: {}, failures: {} },
      bindings: [],
    });
  if (operation === 'matrix-claim')
    return Promise.resolve({ response: { one_time_keys: {}, failures: {} } });
  return Promise.resolve({ response: {} });
};
await test('Megolm real recupera só o período dirigido ao membro e rejeita origem/audiência adulteradas', async (t) => {
  await initAsync();
  const owner = await groupParticipant(),
    member = await groupParticipant(),
    outsider = await groupParticipant();
  const participants = [owner, member].sort((a, b) =>
    a.accountId.localeCompare(b.accountId),
  );
  const keys = await Promise.all(
    participants.map((p) => createRecoveryKey(p.authority)),
  );
  const readerKey = await openRecoveryKey(
    keys[participants.indexOf(member)],
    member.authority,
  );
  const strangerRecovery = await createRecoveryKey(outsider.authority),
    strangerKey = await openRecoveryKey(strangerRecovery, outsider.authority);
  const sender = await MessageCrypto.create({
    accountId: owner.accountId,
    deviceId: owner.deviceId,
    store: null,
    transport: recoveryOnlyTransport,
  });
  const reader = await MessageCrypto.create({
    accountId: member.accountId,
    deviceId: crypto.randomUUID(),
    store: null,
    transport: recoveryOnlyTransport,
  });
  t.after(() => {
    sender.close();
    reader.close();
    readerKey.free();
    strangerKey.free();
  });
  const state: GroupEvent = {
    version: 1,
    groupId: crypto.randomUUID(),
    revision: 2,
    epoch: 2,
    previous: 'a'.repeat(64),
    kind: 'join',
    actor: member.accountId,
    deviceId: member.deviceId,
    directory: member.head,
    authorityRevision: 1,
    target: member.accountId,
    owner: owner.accountId,
    members: participants.map((p) => ({
      accountId: p.accountId,
      role: p.accountId === owner.accountId ? 'owner' : 'member',
      joined: p.accountId === owner.accountId ? 1 : 2,
    })),
    consent: null,
    signature: 'A'.repeat(86) + '==',
  };
  const encrypted = await sender.encryptGroup({
    authority: owner.authority,
    state,
    histories: participants.map((p) => [p.directory]),
    recovery: keys,
    transport: recoveryOnlyTransport,
    id: crypto.randomUUID(),
    text: 'Texto sintético do período autorizado',
  });
  const { packet, keys: bundle } = encrypted;
  const archive = bundle.archives.find((a) => a.accountId === member.accountId);
  assert.ok(archive);
  const exported = openRoomKey(readerKey, archive);
  assert.equal(JSON.stringify(packet).includes('Texto sintético'), false);
  assert.equal(
    await reader.decryptGroup({
      packet,
      keys: bundle,
      period: state,
      senderEvent: owner.directory,
      exported,
    }),
    'Texto sintético do período autorizado',
  );
  await t.test(
    'cache autenticado evita novas consultas e continua recusando adulteração ou participação encerrada',
    async (c) => {
      const hash = await digest(canonical(packet));
      const cached = {
        id: packet.id,
        groupId: packet.groupId,
        sequence: 1,
        epoch: packet.epoch,
        hash,
        sender: packet.sender,
        own: false,
        kind: packet.kind,
        text: 'Texto sintético do período autorizado',
        unavailableMedia: [],
      };
      c.mock.method(GroupCache.prototype, 'get', () => Promise.resolve(cached));
      const access = {
        withVault: () =>
          Promise.reject(new Error('Não deve consultar o cofre.')),
        withLocalVault: () =>
          Promise.reject(new Error('Não deve consultar o cofre.')),
      };
      const context = {
        authority: member.authority,
        group: { state, head: await groupEventHash(state) },
        machine: reader,
        identities: new PeerIdentity(new VaultSync(access)),
        api: () =>
          Promise.reject(
            new Error('Não deve baixar novamente o conteúdo validado.'),
          ),
      };
      const row = {
        id: packet.id,
        epoch: packet.epoch,
        sequence: 1,
        hash,
        packet,
        unavailableMedia: [],
      };
      const page = { items: [row], keys: [] };
      assert.equal(
        (await readGroupPage(context, page)).views[0]?.text,
        cached.text,
      );
      await assert.rejects(
        readGroupPage(context, {
          ...page,
          items: [
            {
              ...row,
              packet: {
                ...packet,
                signature: Buffer.alloc(64, 2).toString('base64'),
              },
            },
          ],
        }),
        /Mensagem divergente/u,
      );
      await assert.rejects(
        readGroupPage(
          {
            ...context,
            group: {
              ...context.group,
              state: {
                ...state,
                members: state.members.filter(
                  (m) => m.accountId !== member.accountId,
                ),
              },
            },
          },
          page,
        ),
        /período de participação/u,
      );
    },
  );
  assert.throws(() => openRoomKey(strangerKey, archive));
  await assert.rejects(
    reader.decryptGroup({
      packet: { ...packet, groupId: crypto.randomUUID() },
      keys: bundle,
      period: state,
      senderEvent: owner.directory,
      exported,
    }),
  );
  const changed = {
    ...bundle,
    destinations: bundle.destinations.filter(
      (d) => d.accountId !== member.accountId,
    ),
    archives: bundle.archives.filter((a) => a.accountId !== member.accountId),
  };
  await assert.rejects(
    reader.decryptGroup({
      packet,
      keys: changed,
      period: state,
      senderEvent: owner.directory,
      exported,
    }),
  );
  const removed: GroupEvent = {
    ...state,
    revision: 3,
    epoch: 3,
    previous: await groupEventHash(state),
    kind: 'remove',
    actor: owner.accountId,
    deviceId: owner.deviceId,
    directory: owner.head,
    target: member.accountId,
    members: state.members.filter((m) => m.accountId === owner.accountId),
  };
  removed.signature = await sign(owner.signing, groupEventProof(removed));
  const ownerKey = keys[participants.indexOf(owner)];
  assert.ok(ownerKey);
  const next = await sender.encryptGroup({
    authority: owner.authority,
    state: removed,
    histories: [[owner.directory]],
    recovery: [ownerKey],
    transport: recoveryOnlyTransport,
    id: crypto.randomUUID(),
    text: 'Mensagem depois da remoção',
  });
  assert.equal(
    next.keys.archives.some((a) => a.accountId === member.accountId),
    false,
  );
  assert.notEqual(packet.content.session_id, next.packet.content.session_id);
  await assert.rejects(
    reader.decryptGroup({
      packet: next.packet,
      keys: next.keys,
      period: removed,
      senderEvent: owner.directory,
      exported,
    }),
  );
  assert.notEqual(canonical(packet.content), canonical(next.packet.content));
  const repeated = await sender.encryptGroup({
    authority: owner.authority,
    state: removed,
    histories: [[owner.directory]],
    recovery: [ownerKey],
    transport: recoveryOnlyTransport,
    id: crypto.randomUUID(),
    text: 'Segunda mensagem da mesma sessão',
  });
  assert.equal(repeated.packet.keyHash, next.packet.keyHash);
  assert.equal(repeated.keys, next.keys);
  const regenerated = await MessageCrypto.create({
    accountId: owner.accountId,
    deviceId: owner.deviceId,
    store: null,
    transport: recoveryOnlyTransport,
  });
  t.after(() => regenerated.close());
  const fresh = await regenerated.encryptGroup({
    authority: owner.authority,
    state: removed,
    histories: [[owner.directory]],
    recovery: [ownerKey],
    transport: recoveryOnlyTransport,
    id: crypto.randomUUID(),
    text: 'SDK recriado não reutiliza uma cápsula vinculada à identidade anterior',
    existingKeys: next.keys,
  });
  assert.notEqual(fresh.packet.keyHash, next.packet.keyHash);
  assert.notDeepEqual(
    fresh.keys.binding.public.keys,
    next.keys.binding.public.keys,
  );
});
