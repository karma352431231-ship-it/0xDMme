import { base64, encode } from '../../shared/account/index.ts';
import {
  blockLimit,
  bytesHash,
  commitProof,
  vaultChange,
  vaultContext,
} from '../../shared/vault/index.ts';
import type { VaultChange, VaultCommit } from '../../shared/vault/index.ts';
const encoder = new TextEncoder();
async function encrypt(
  key: CryptoKey,
  bytes: Uint8Array,
  context: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: Uint8Array.from(context),
        tagLength: 128,
      },
      key,
      Uint8Array.from(bytes),
    ),
  );
  const output = new Uint8Array(12 + encrypted.length);
  output.set(iv);
  output.set(encrypted, 12);
  return output;
}
async function decrypt(
  key: CryptoKey,
  bytes: Uint8Array,
  context: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: Uint8Array.from(bytes.slice(0, 12)),
        additionalData: Uint8Array.from(context),
        tagLength: 128,
      },
      key,
      Uint8Array.from(bytes.slice(12)),
    ),
  );
}
export async function sealBlock(
  key: CryptoKey,
  identity: Pick<VaultCommit, 'accountId' | 'id' | 'epoch'>,
  value: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const plaintext = encoder.encode(value);
  try {
    if (!plaintext.length || plaintext.length > blockLimit - 28)
      throw new Error('Conteúdo deve ter até 3 MB.');
    return await encrypt(key, plaintext, vaultContext(identity, 'block'));
  } finally {
    plaintext.fill(0);
  }
}
export async function openBlock(
  key: CryptoKey,
  commit: VaultCommit,
  bytes: Uint8Array,
): Promise<string> {
  if (
    bytes.length !== commit.block.bytes ||
    (await bytesHash(bytes)) !== commit.block.hash
  )
    throw new Error('Bloco incompleto ou corrompido.');
  const plaintext = await decrypt(key, bytes, vaultContext(commit, 'block'));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } finally {
    plaintext.fill(0);
  }
}
export async function sealCommit(input: {
  unsigned: Omit<VaultCommit, 'manifest' | 'signature'>;
  change: VaultChange;
  key: CryptoKey;
  sign: (proof: string) => Promise<string>;
}): Promise<VaultCommit> {
  const plaintext = encoder.encode(JSON.stringify(vaultChange(input.change)));
  try {
    const envelope = await encrypt(
      input.key,
      plaintext,
      vaultContext(input.unsigned, 'manifest'),
    );
    const commit: VaultCommit = {
      ...input.unsigned,
      manifest: {
        iv: encode(envelope.slice(0, 12)),
        ciphertext: encode(envelope.slice(12)),
      },
      signature: '',
    };
    commit.signature = await input.sign(commitProof(commit));
    return commit;
  } finally {
    plaintext.fill(0);
  }
}
export async function openManifest(
  key: CryptoKey,
  commit: VaultCommit,
): Promise<VaultChange> {
  const iv = base64(commit.manifest.iv, 12);
  const ciphertext = base64(commit.manifest.ciphertext, 4096);
  const envelope = new Uint8Array(iv.length + ciphertext.length);
  envelope.set(iv);
  envelope.set(ciphertext, 12);
  const plaintext = await decrypt(
    key,
    envelope,
    vaultContext(commit, 'manifest'),
  );
  try {
    return vaultChange(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
      ) as unknown,
    );
  } finally {
    plaintext.fill(0);
  }
}
