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
import {
  socialDirectory,
  socialPacket,
} from '../src/shared/social-dm/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';

const transport: MessageTransport = (operation) =>
  Promise.resolve(
    operation === 'matrix-upload'
      ? { response: { one_time_key_counts: { signed_curve25519: 50 } } }
      : operation === 'matrix-query'
        ? { response: { device_keys: {}, failures: {} }, bindings: [] }
        : operation === 'matrix-claim'
          ? { response: { one_time_keys: {}, failures: {} } }
          : { response: {} },
  );
await test('DM pelo @ reutiliza Megolm com identidade/chaves próprias e não recupera com chave privada', async (t) => {
  await initAsync();
  const privatePeer = await groupParticipant(),
    sender = await groupParticipant({ deviceName: 'Aparelho de DMs' }),
    recipient = await groupParticipant({ deviceName: 'Aparelho de DMs' });
  const recovery = await Promise.all(
    [sender, recipient, privatePeer].map((p) => createRecoveryKey(p.authority)),
  );
  const machine = await MessageCrypto.create({
      accountId: sender.accountId,
      deviceId: sender.deviceId,
      store: null,
      transport,
    }),
    reader = await MessageCrypto.create({
      accountId: recipient.accountId,
      deviceId: recipient.deviceId,
      store: null,
      transport,
    });
  t.after(() => {
    machine.close();
    reader.close();
  });
  const packet = socialPacket(
    await machine.encrypt({
      authority: sender.authority,
      peerHistory: [recipient.directory],
      recovery: recovery.slice(0, 2),
      id: crypto.randomUUID(),
      text: 'Texto sintético e https://0xdmme.app',
    }),
  );
  const body = JSON.stringify(packet);
  for (const value of [
    privatePeer.accountId,
    privatePeer.deviceId,
    privatePeer.directory.root.signing,
    privatePeer.directory.root.wrapping,
    'Texto sintético',
  ])
    assert.equal(body.includes(value), false);
  assert.equal(socialDirectory(sender.directory).root.wallet, undefined);
  const key = await openRecoveryKey(recovery[1], recipient.authority),
    wrong = await openRecoveryKey(recovery[2], privatePeer.authority);
  try {
    const archive = packet.archives.find(
      (a) => a.accountId === recipient.accountId,
    );
    assert.ok(archive);
    assert.throws(() => openRoomKey(wrong, archive));
    assert.equal(
      await reader.decrypt({
        packet,
        senderEvent: sender.directory,
        exported: openRoomKey(key, archive),
      }),
      'Texto sintético e https://0xdmme.app',
    );
    assert.throws(() => socialPacket({ ...packet, kind: 'profile' }));
    assert.throws(() =>
      socialDirectory({ ...sender.directory, profile: 'a'.repeat(64) }),
    );
    assert.throws(() =>
      socialDirectory({
        ...sender.directory,
        devices: [
          { ...sender.directory.devices[0], name: 'Nome privado do aparelho' },
        ],
      }),
    );
  } finally {
    key.free();
    wrong.free();
  }
});
