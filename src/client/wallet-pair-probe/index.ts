import { base64urlnopad } from '@scure/base';
import {
  ProbeError,
  recoveryMessage,
  signatureBytes,
} from '../wallet-recovery-probe/index.ts';
import type { ProbeContext } from '../wallet-recovery-probe/index.ts';

// Isolated experiment: a key that needs the recovery signatures of two wallets.
// Deliberately separate from login, device authority and every real vault format.
const format = '0xdmme-wallet-pair-recovery-experiment-v1';
const payload = new TextEncoder().encode(
  '0xDMme: synthetic two-wallet recovery test content.',
);
export type ProbePair = readonly [ProbeContext, ProbeContext];
export interface PairPacket {
  format: typeof format;
  /** Canonical order: ecosystem, then address. */
  contexts: ProbePair;
  salt: string;
  iv: string;
  ciphertext: string;
}

function walletKey(context: ProbeContext): string {
  return `${context.ecosystem}:${context.address}`;
}
function canonicalPair(first: ProbeContext, second: ProbeContext): ProbePair {
  if (walletKey(first) === walletKey(second))
    throw new ProbeError('A pair needs two different wallets.');
  return walletKey(first) < walletKey(second)
    ? [first, second]
    : [second, first];
}
/** Binds the key and the ciphertext to both statements, in canonical order. */
function binding(pair: ProbePair): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify([format, ...pair.map(recoveryMessage)]),
  );
}
function signatureFor(
  context: ProbeContext,
  signatures: readonly string[],
): Uint8Array {
  for (const signature of signatures) {
    try {
      return signatureBytes(context, signature);
    } catch {
      // Try the other signature; one must belong to this wallet.
    }
  }
  throw new ProbeError('A signature from each wallet of the pair is required.');
}
/** One length byte, then the signature, for each wallet in canonical order. */
function keyMaterial(
  pair: ProbePair,
  signatures: readonly string[],
): Uint8Array<ArrayBuffer> {
  if (signatures.length !== 2)
    throw new ProbeError('A pair needs exactly two signatures.');
  const parts = pair.map((context) => signatureFor(context, signatures));
  try {
    const material = new Uint8Array(
      parts.reduce((total, part) => total + 1 + part.length, 0),
    );
    let offset = 0;
    for (const part of parts) {
      material[offset] = part.length;
      material.set(part, offset + 1);
      offset += 1 + part.length;
    }
    return material;
  } finally {
    for (const part of parts) part.fill(0);
  }
}
/** HKDF `info` is limited to 1024 bytes and two statements exceed it, so the
 * key is bound to their SHA-256 digest; AES-GCM still authenticates both. */
async function keyContext(pair: ProbePair): Promise<Uint8Array<ArrayBuffer>> {
  const label = new TextEncoder().encode(`${format}\n`);
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', binding(pair)),
  );
  const context = new Uint8Array(label.length + digest.length);
  context.set(label);
  context.set(digest, label.length);
  return context;
}
async function pairKey(input: {
  pair: ProbePair;
  signatures: readonly string[];
  salt: Uint8Array<ArrayBuffer>;
}): Promise<CryptoKey> {
  const info = await keyContext(input.pair);
  const bytes = keyMaterial(input.pair, input.signatures);
  try {
    const material = await crypto.subtle.importKey(
      'raw',
      bytes,
      'HKDF',
      false,
      ['deriveKey'],
    );
    return await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: input.salt,
        info,
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } finally {
    bytes.fill(0);
  }
}
export async function sealPair(input: {
  contexts: readonly [ProbeContext, ProbeContext];
  signatures: readonly string[];
}): Promise<PairPacket> {
  const pair = canonicalPair(...input.contexts);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await pairKey({ pair, signatures: input.signatures, salt });
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: binding(pair), tagLength: 128 },
    key,
    payload,
  );
  return {
    format,
    contexts: pair,
    salt: base64urlnopad.encode(salt),
    iv: base64urlnopad.encode(iv),
    ciphertext: base64urlnopad.encode(new Uint8Array(ciphertext)),
  };
}
function decode(value: string, length: number): Uint8Array<ArrayBuffer> {
  let bytes: Uint8Array;
  try {
    bytes = base64urlnopad.decode(value);
  } catch {
    throw new ProbeError('Invalid test encoding.');
  }
  if (bytes.length !== length) throw new ProbeError('Invalid test encoding.');
  return Uint8Array.from(bytes);
}
/** Succeeds only with one valid signature from each wallet of the packet. */
export async function openPair(input: {
  packet: PairPacket;
  signatures: readonly string[];
}): Promise<void> {
  const { packet } = input;
  if (packet.format !== format) throw new ProbeError('Invalid test format.');
  const pair = canonicalPair(...packet.contexts);
  const key = await pairKey({
    pair,
    signatures: input.signatures,
    salt: decode(packet.salt, 32),
  });
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decode(packet.iv, 12),
        additionalData: binding(pair),
        tagLength: 128,
      },
      key,
      decode(packet.ciphertext, payload.length + 16),
    );
  } catch {
    throw new ProbeError(
      'The package could not open: different signature or tampered data.',
    );
  }
  const bytes = new Uint8Array(plaintext);
  const matches = payload.every((byte, index) => bytes[index] === byte);
  bytes.fill(0);
  if (!matches) throw new ProbeError('Invalid fictional content.');
}
