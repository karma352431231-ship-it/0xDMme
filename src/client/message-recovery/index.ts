import {
  BackupDecryptionKey,
  Curve25519PublicKey,
  PkEncryption,
  initAsync,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import { base64, encode } from '../../shared/account/index.ts';
import {
  recoveryKeyProof,
  recoveryKey,
  roomKeyArchive,
  verifyRecoveryKey,
} from '../../shared/messages/index.ts';
import type {
  RecoveryKey,
  RoomKeyArchive,
} from '../../shared/messages/index.ts';
import { bytesHash } from '../../shared/vault/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { openBlock, sealBlock } from '../vault-crypto/index.ts';

/** One account/epoch backup key, encapsulated only under that account's vault AES key. */
export async function createRecoveryKey(
  authority: VaultAuthority,
): Promise<RecoveryKey> {
  await initAsync('/matrix-crypto-18.9.0.wasm');
  const secret = BackupDecryptionKey.createRandomKey();
  const publicKey = secret.megolmV1PublicKey;
  try {
    const id = crypto.randomUUID();
    const identity = {
      accountId: authority.session.accountId,
      id,
      epoch: authority.epoch,
    };
    const bytes = await sealBlock(
      await authority.key(authority.epoch),
      identity,
      secret.toBase64(),
    );
    const key: RecoveryKey = {
      version: 1,
      ...identity,
      deviceId: authority.session.deviceId,
      authorityRevision: authority.events.length,
      directory: authority.directory,
      publicKey: publicKey.publicKeyBase64,
      capsule: {
        hash: await bytesHash(bytes),
        bytes: bytes.length,
        ciphertext: encode(bytes),
      },
      signature: '',
    };
    key.signature = await authority.sign(recoveryKeyProof(key));
    return key;
  } finally {
    publicKey.free();
    secret.free();
  }
}
export async function openRecoveryKey(
  input: unknown,
  authority: VaultAuthority,
): Promise<BackupDecryptionKey> {
  await initAsync('/matrix-crypto-18.9.0.wasm');
  const raw = recoveryKey(input);
  const event = authority.events[raw.authorityRevision - 1];
  if (!event) throw new Error('Autoridade histórica da recuperação ausente.');
  const key = await verifyRecoveryKey(input, event);
  if (key.accountId !== authority.session.accountId)
    throw new Error('Recuperação de outra conta.');
  const secret = BackupDecryptionKey.fromBase64(
    await openBlock(
      await authority.key(key.epoch),
      { ...key, block: key.capsule },
      base64(key.capsule.ciphertext, 1024),
    ),
  );
  const publicKey = secret.megolmV1PublicKey;
  try {
    if (publicKey.publicKeyBase64 !== key.publicKey)
      throw new Error('Chave recuperada divergente.');
  } catch (error: unknown) {
    secret.free();
    throw error;
  } finally {
    publicKey.free();
  }
  return secret;
}
export async function archiveRoomKey(
  key: RecoveryKey,
  exported: string,
): Promise<RoomKeyArchive> {
  await initAsync('/matrix-crypto-18.9.0.wasm');
  const publicKey = new Curve25519PublicKey(key.publicKey);
  const encryption = PkEncryption.fromKey(publicKey);
  try {
    const message = encryption.encryptString(exported);
    try {
      const encoded = message.toBase64();
      try {
        return roomKeyArchive({
          accountId: key.accountId,
          keyId: key.id,
          ciphertext: encoded.ciphertext,
          ephemeral: encoded.ephemeralKey,
          mac: encoded.mac,
        });
      } finally {
        encoded.free();
      }
    } finally {
      message.free();
    }
  } finally {
    encryption.free();
    publicKey.free();
  }
}
export function openRoomKey(
  secret: BackupDecryptionKey,
  archive: RoomKeyArchive,
): string {
  const validated = roomKeyArchive(archive);
  return secret.decryptV1(
    validated.ephemeral,
    validated.mac,
    validated.ciphertext,
  );
}

/** Prepare the existing account recovery capsule before any shared publication. */
export async function ensureMessageRecovery(
  authority: VaultAuthority,
  api: (
    operation: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>,
): Promise<RecoveryKey> {
  let raw = await api('recovery-current', {});
  if (raw === null)
    raw = await api('recovery-register', {
      key: await createRecoveryKey(authority),
    });
  const key = recoveryKey(raw),
    event = authority.events[key.authorityRevision - 1];
  if (!event) throw new Error('Autoridade da recuperação ausente.');
  await verifyRecoveryKey(key, event);
  const secret = await openRecoveryKey(key, authority);
  secret.free();
  return key;
}
