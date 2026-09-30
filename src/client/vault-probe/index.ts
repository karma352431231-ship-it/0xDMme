import {
  onlyKeys,
  parseObject,
  record,
  text,
} from '../../shared/crypto-probe/index.ts';
import {
  authenticatedHeader,
  decode,
  encode,
  parseEnvelope,
  vaultFormat,
} from '../../shared/vault-probe/index.ts';
import type { VaultEnvelope } from '../../shared/vault-probe/index.ts';

export type HistoryEntry = { id: string; body: string };
export type HistorySnapshot = {
  owner: string;
  revision: number;
  messages: HistoryEntry[];
};

function history(value: unknown): HistorySnapshot {
  const snapshot = record(value);
  onlyKeys(snapshot, ['owner', 'revision', 'messages']);
  const revision = snapshot.revision;
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    throw new Error('Revisão de histórico inválida.');
  if (!Array.isArray(snapshot.messages) || snapshot.messages.length > 32)
    throw new Error('Histórico excede o limite do ensaio.');
  const messages = snapshot.messages.map((item: unknown) => {
    const entry = record(item);
    onlyKeys(entry, ['id', 'body']);
    return { id: text(entry.id, 100), body: text(entry.body, 1_000) };
  });
  if (new Set(messages.map((entry) => entry.id)).size !== messages.length)
    throw new Error('Histórico com identificadores repetidos.');
  return { owner: text(snapshot.owner, 100), revision, messages };
}

async function recoveryKey(secret: string): Promise<CryptoKey> {
  const bytes = decode(secret, 32);
  if (bytes.length !== 32) throw new Error('Segredo de recuperação inválido.');
  try {
    return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
      'wrapKey',
      'unwrapKey',
    ]);
  } finally {
    bytes.fill(0);
  }
}

/** Segredo aleatório de 256 bits, independente de wallet, senha ou assinatura. */
export function newRecoverySecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  try {
    return encode(bytes);
  } finally {
    bytes.fill(0);
  }
}

export async function sealHistory(
  snapshot: HistorySnapshot,
  secret: string,
): Promise<VaultEnvelope> {
  const validated = history(snapshot);
  const plaintext = new TextEncoder().encode(JSON.stringify(validated));
  if (plaintext.length > 32_000)
    throw new Error('Histórico excede o limite do ensaio.');
  const aad = authenticatedHeader(validated.owner, validated.revision);
  const wrappingKey = await recoveryKey(secret);
  // Uma chave de dados nova por snapshot; nenhum nonce/ratchet próprio.
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
      key,
      plaintext,
    );
    const wrappedKey = await crypto.subtle.wrapKey('raw', key, wrappingKey, {
      name: 'AES-GCM',
      iv: wrapIv,
      additionalData: aad,
      tagLength: 128,
    });
    return {
      format: vaultFormat,
      version: 1,
      owner: validated.owner,
      revision: validated.revision,
      iv: encode(iv),
      wrapIv: encode(wrapIv),
      wrappedKey: encode(new Uint8Array(wrappedKey)),
      ciphertext: encode(new Uint8Array(ciphertext)),
    };
  } finally {
    plaintext.fill(0);
  }
}

/** Abre somente histórico. Não importa autorização, dispositivos ou sessões Olm. */
export async function openHistory(
  serialized: string,
  secret: string,
  expectedOwner: string,
): Promise<HistorySnapshot> {
  const envelope = parseEnvelope(serialized);
  if (envelope.owner !== expectedOwner)
    throw new Error('Cofre pertence a outra identidade.');
  const aad = authenticatedHeader(envelope.owner, envelope.revision);
  try {
    const wrappingKey = await recoveryKey(secret);
    const key = await crypto.subtle.unwrapKey(
      'raw',
      decode(envelope.wrappedKey, 48),
      wrappingKey,
      {
        name: 'AES-GCM',
        iv: decode(envelope.wrapIv, 12),
        additionalData: aad,
        tagLength: 128,
      },
      'AES-GCM',
      false,
      ['decrypt'],
    );
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: decode(envelope.iv, 12),
          additionalData: aad,
          tagLength: 128,
        },
        key,
        decode(envelope.ciphertext, 32_016),
      ),
    );
    try {
      const restored = history(
        parseObject(
          new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
        ),
      );
      if (
        restored.owner !== envelope.owner ||
        restored.revision !== envelope.revision
      )
        throw new Error('Manifesto inconsistente.');
      return restored;
    } finally {
      plaintext.fill(0);
    }
  } catch (error: unknown) {
    throw new Error('Cofre rejeitado: segredo ou integridade inválidos.', {
      cause: error,
    });
  }
}
