import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DecryptionSettings,
  DeviceId,
  EncryptionSettings,
  initAsync,
  OlmMachine,
  RoomId,
  TrustRequirement,
  UserId,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import {
  createRecoveryKey,
  openRecoveryKey,
  archiveRoomKey,
  openRoomKey,
} from '../src/client/message-recovery/index.ts';
import {
  aesKey,
  createIdentity,
  createRecovery,
  newSecret,
  recoverSecrets,
} from '../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../src/client/device-operations/index.ts';
import { eventHash, sign } from '../src/shared/devices/index.ts';
import {
  verifyRecoveryKey,
  matrixBase64,
  messageRoom,
  matrixUser,
} from '../src/shared/messages/index.ts';
import type { VaultAuthority } from '../src/client/vault-authority/index.ts';
import { object } from '../src/shared/account/index.ts';

async function fixture() {
  const accountId = crypto.randomUUID(),
    identity = await createIdentity(crypto.randomUUID(), 'Sintético');
  const recoverySecret = newSecret(),
    recovery = await createRecovery(accountId, recoverySecret);
  const ring = freshKeyring(accountId);
  const event = await prepareEvent({
    accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: recovery.signing,
    root: recovery.root,
    identities: [identity.public],
    ring,
    profile: null,
  });
  const authority: VaultAuthority = {
    session: { accountId, deviceId: identity.public.id, csrf: 'sintético' },
    offline: false,
    directory: await eventHash(event),
    epoch: 1,
    events: [event],
    key: () => aesKey(ring.keys[0] ?? ''),
    sign: (proof) => sign(identity.signing, proof),
  };
  return { authority, event, recoverySecret };
}
await test('backup de leitura nasce cifrado, autenticado e vinculado à conta/época', async () => {
  const { authority, event } = await fixture();
  const key = await createRecoveryKey(authority);
  assert.deepEqual(await verifyRecoveryKey(key, event), key);
  const privateKey = await openRecoveryKey(key, authority);
  try {
    assert.equal(JSON.stringify(key).includes(privateKey.toBase64()), false);
    await assert.rejects(
      verifyRecoveryKey(
        {
          ...key,
          publicKey: matrixBase64(
            'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            32,
          ),
        },
        event,
      ),
    );
    await assert.rejects(
      verifyRecoveryKey({ ...key, accountId: crypto.randomUUID() }, event),
    );
    await assert.rejects(
      openRecoveryKey(key, { ...authority, key: () => aesKey(newSecret()) }),
    );
    await assert.rejects(
      openRecoveryKey(key, {
        ...authority,
        session: { ...authority.session, accountId: crypto.randomUUID() },
      }),
    );
  } finally {
    privateKey.free();
  }
});
await test('mensagem ainda não recebida abre em aparelho novo após recuperar só o cofre', async (t) => {
  const recipient = await fixture(),
    stranger = await fixture();
  const recovery = await createRecoveryKey(recipient.authority);
  await initAsync();
  const senderAccount = crypto.randomUUID(),
    room = messageRoom(senderAccount, recipient.authority.session.accountId);
  const sender = await OlmMachine.initialize(
    new UserId(matrixUser(senderAccount)),
    new DeviceId(crypto.randomUUID()),
  );
  t.after(() => sender.close());
  const encryption = new EncryptionSettings();
  try {
    const requests = await sender.shareRoomKey(
      new RoomId(room),
      [],
      encryption,
    );
    for (const request of requests) request.free();
  } finally {
    encryption.free();
  }
  const text = 'Texto sintético que nunca chegou ao aparelho antigo';
  const content = object(
    JSON.parse(
      await sender.encryptRoomEvent(
        new RoomId(room),
        'm.room.message',
        JSON.stringify({ msgtype: 'm.text', body: text }),
      ),
    ) as unknown,
  );
  const exported = await sender.exportRoomKeys(
    (session) =>
      session.roomId.toString() === room &&
      session.sessionId === content['session_id'],
  );
  const archive = await archiveRoomKey(recovery, exported);
  assert.equal(JSON.stringify(archive).includes(text), false);
  const recovered = await recoverSecrets(
    recipient.event,
    recipient.recoverySecret,
  );
  const newAuthority: VaultAuthority = {
    ...recipient.authority,
    session: { ...recipient.authority.session, deviceId: crypto.randomUUID() },
    key: (epoch) => aesKey(recovered.ring.keys[epoch - 1] ?? ''),
  };
  const readerKey = await openRecoveryKey(recovery, newAuthority);
  const newReader = await OlmMachine.initialize(
    new UserId(matrixUser(newAuthority.session.accountId)),
    new DeviceId(newAuthority.session.deviceId),
  );
  t.after(() => newReader.close());
  try {
    const result = await newReader.importExportedRoomKeys(
      openRoomKey(readerKey, archive),
      () => {},
    );
    result.free();
    const settings = new DecryptionSettings(TrustRequirement.Untrusted);
    try {
      const result = await newReader.decryptRoomEvent(
        JSON.stringify({
          event_id: `$${crypto.randomUUID()}`,
          type: 'm.room.encrypted',
          sender: matrixUser(senderAccount),
          origin_server_ts: 0,
          content,
        }),
        new RoomId(room),
        settings,
      );
      try {
        assert.equal(
          object(object(JSON.parse(result.event) as unknown)['content'])[
            'body'
          ],
          text,
        );
      } finally {
        result.free();
      }
    } finally {
      settings.free();
    }
    assert.equal(newReader.deviceId.toString(), newAuthority.session.deviceId);
    const other = await openRecoveryKey(
      await createRecoveryKey(stranger.authority),
      stranger.authority,
    );
    try {
      assert.throws(() => openRoomKey(other, archive));
    } finally {
      other.free();
    }
    assert.throws(() =>
      openRoomKey(readerKey, { ...archive, mac: 'AAAAAAAAAAA' }),
    );
  } finally {
    readerKey.free();
  }
});
