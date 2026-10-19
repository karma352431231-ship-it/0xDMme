import { Signature, getBytes, verifyMessage } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519';
import { base58, base64urlnopad } from '@scure/base';
import {
  canonicalAddress,
  ecosystem,
  solanaPublicKey,
} from '../../shared/wallet-identity/index.ts';
import type { Ecosystem } from '../../shared/wallet-identity/index.ts';

// Deliberately separate from login, device authority and every real vault format.
const format = '0xdmme-wallet-recovery-experiment-v2';
const payload = new TextEncoder().encode(
  '0xDMme: synthetic recovery test content / 恢复测试的虚构内容。',
);
export const maxPacketBytes = 4096;
export class ProbeError extends Error {}
export interface ProbeContext {
  version: 2;
  origin: string;
  ecosystem: Ecosystem;
  address: string;
  id: string;
}
export interface ProbePacket {
  format: typeof format;
  context: ProbeContext;
  salt: string;
  iv: string;
  ciphertext: string;
}
export type ProbeIdentity = Pick<ProbeContext, 'ecosystem' | 'address'>;

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ProbeError('Invalid test package.');
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(record, key))
  )
    throw new ProbeError('Invalid test fields.');
  return record;
}
function decode(value: unknown, length: number): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== 'string' ||
    value.length !== Math.ceil((length * 8) / 6) ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  )
    throw new ProbeError('Invalid test encoding.');
  const bytes = Uint8Array.from(base64urlnopad.decode(value));
  if (bytes.length !== length || base64urlnopad.encode(bytes) !== value)
    throw new ProbeError('Invalid test encoding.');
  return bytes;
}
function origin(value: unknown): string {
  if (typeof value !== 'string' || value.length > 256)
    throw new ProbeError('Invalid test origin.');
  const url = new URL(value);
  const local =
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if ((!local && url.protocol !== 'https:') || url.origin !== value)
    throw new ProbeError('Invalid test origin.');
  return value;
}
function context(value: unknown): ProbeContext {
  const input = object(value, [
    'version',
    'origin',
    'ecosystem',
    'address',
    'id',
  ]);
  if (input['version'] !== 2) throw new ProbeError('Invalid test version.');
  const network = ecosystem(input['ecosystem']);
  const address = canonicalAddress(network, input['address']);
  if (address !== input['address'])
    throw new ProbeError('Test account is not canonical.');
  return {
    version: 2,
    origin: origin(input['origin']),
    ecosystem: network,
    address,
    id: base64urlnopad.encode(decode(input['id'], 32)),
  };
}
export function createProbeContext(input: {
  origin: string;
  identity: ProbeIdentity;
}): ProbeContext {
  return context({
    version: 2,
    origin: input.origin,
    ecosystem: input.identity.ecosystem,
    address: canonicalAddress(input.identity.ecosystem, input.identity.address),
    id: base64urlnopad.encode(crypto.getRandomValues(new Uint8Array(32))),
  });
}
export function recoveryMessage(input: ProbeContext): string {
  const value = context(input);
  return [
    '0xDMme - Test recovery with sample data / 使用示例数据测试恢复 - v2',
    '',
    'This signature lets you test restoring access to sample data in 0xDMme.',
    '此签名可用于在 0xDMme 中测试恢复对示例数据的访问。',
    'This test does not access your messages or private settings.',
    '此测试不会访问你的消息或私人设置。',
    '',
    'It does not sign you in, move funds, send transactions or approve token spending.',
    '它不会登录你的账户、转移资金、发送交易或授权代币支出。',
    '',
    'Sign only if you started this test in 0xDMme.',
    '仅在你自己于 0xDMme 中发起此测试时签名。',
    'Keep this signature private.',
    '请勿分享此签名。',
    '',
    `Origin / 来源: ${value.origin}`,
    `Ecosystem / 生态系统: ${value.ecosystem}`,
    `Account / 账户: ${value.address}`,
    `Test / 测试: ${value.id}`,
  ].join('\n');
}
function signatureBytes(input: ProbeContext, signature: string) {
  const message = recoveryMessage(input);
  if (input.ecosystem === 'evm') {
    if (!/^0x[0-9a-fA-F]{130}$/u.test(signature))
      throw new ProbeError('Invalid test signature.');
    const canonical = Signature.from(signature).serialized;
    if (verifyMessage(message, canonical).toLowerCase() !== input.address)
      throw new ProbeError(
        'The signature does not belong to the test account.',
      );
    return Uint8Array.from(getBytes(canonical));
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/u.test(signature))
    throw new ProbeError('Invalid test signature.');
  const bytes = Uint8Array.from(base58.decode(signature));
  if (
    bytes.length !== 64 ||
    !ed25519.verify(
      bytes,
      new TextEncoder().encode(message),
      solanaPublicKey(input.address),
      { zip215: false },
    )
  )
    throw new ProbeError('The signature does not belong to the test account.');
  return bytes;
}
export function repeatableSignatures(input: {
  context: ProbeContext;
  first: string;
  second: string;
}): boolean {
  const value = context(input.context);
  const first = signatureBytes(value, input.first);
  const second = signatureBytes(value, input.second);
  return first.every((byte, index) => byte === second[index]);
}
async function key(input: {
  context: ProbeContext;
  signature: string;
  salt: Uint8Array<ArrayBuffer>;
}): Promise<CryptoKey> {
  const bytes = signatureBytes(input.context, input.signature);
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
        info: new TextEncoder().encode(
          `${format}\n${recoveryMessage(input.context)}`,
        ),
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
export async function sealProbe(
  input: ProbeContext,
  signature: string,
): Promise<ProbePacket> {
  const value = context(input);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const derived = await key({ context: value, signature, salt });
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(recoveryMessage(value)),
      tagLength: 128,
    },
    derived,
    payload,
  );
  return {
    format,
    context: value,
    salt: base64urlnopad.encode(salt),
    iv: base64urlnopad.encode(iv),
    ciphertext: base64urlnopad.encode(new Uint8Array(ciphertext)),
  };
}
export function parseProbePacket(value: unknown): ProbePacket {
  const input = object(value, [
    'format',
    'context',
    'salt',
    'iv',
    'ciphertext',
  ]);
  if (input['format'] !== format) throw new ProbeError('Invalid test format.');
  return {
    format,
    context: context(input['context']),
    salt: base64urlnopad.encode(decode(input['salt'], 32)),
    iv: base64urlnopad.encode(decode(input['iv'], 12)),
    ciphertext: base64urlnopad.encode(
      decode(input['ciphertext'], payload.length + 16),
    ),
  };
}
export function readProbePacket(text: string): ProbePacket {
  if (new TextEncoder().encode(text).length > maxPacketBytes)
    throw new ProbeError('Test package exceeds the limit.');
  const value: unknown = JSON.parse(text);
  return parseProbePacket(value);
}
export function checkProbeIdentity(input: {
  packet: ProbePacket;
  origin: string;
  identity: ProbeIdentity;
}): void {
  const value = parseProbePacket(input.packet).context;
  if (value.origin !== origin(input.origin))
    throw new ProbeError('The package belongs to another origin.');
  if (
    value.ecosystem !== input.identity.ecosystem ||
    value.address !==
      canonicalAddress(input.identity.ecosystem, input.identity.address)
  )
    throw new ProbeError("The selected account is not the package's account.");
}
export async function openProbe(input: {
  packet: ProbePacket;
  origin: string;
  identity: ProbeIdentity;
  signature: string;
}): Promise<void> {
  const packet = parseProbePacket(input.packet);
  checkProbeIdentity({ ...input, packet });
  const derived = await key({
    context: packet.context,
    signature: input.signature,
    salt: decode(packet.salt, 32),
  });
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decode(packet.iv, 12),
        additionalData: new TextEncoder().encode(
          recoveryMessage(packet.context),
        ),
        tagLength: 128,
      },
      derived,
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
