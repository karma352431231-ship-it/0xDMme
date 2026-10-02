import {
  base64,
  encode,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import {
  canonical,
  deviceIdentity,
  directoryLimit,
  sign,
  signedBody,
  verify,
} from '../../shared/devices/index.ts';
import type {
  DeviceIdentity,
  DirectoryEvent,
  RecoveryRoot,
  SealedSecret,
} from '../../shared/devices/index.ts';

export interface LocalIdentity {
  public: DeviceIdentity;
  signing: CryptoKey;
  wrapping: CryptoKey;
}
export interface Keyring {
  accountId: string;
  epoch: number;
  keys: string[];
}
const signingAlgorithm = { name: 'ECDSA', namedCurve: 'P-256' };
const wrappingAlgorithm = {
  name: 'RSA-OAEP',
  modulusLength: 3072,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};
const encoder = new TextEncoder();
export function newSecret(): string {
  return encode(crypto.getRandomValues(new Uint8Array(32)));
}
export async function createIdentity(
  id: string,
  name: string,
): Promise<LocalIdentity> {
  const signing = await crypto.subtle.generateKey(signingAlgorithm, false, [
    'sign',
    'verify',
  ]);
  const wrapping = await crypto.subtle.generateKey(wrappingAlgorithm, false, [
    'encrypt',
    'decrypt',
  ]);
  return {
    public: deviceIdentity({
      id,
      name,
      signing: encode(
        new Uint8Array(await crypto.subtle.exportKey('raw', signing.publicKey)),
      ),
      wrapping: encode(
        new Uint8Array(
          await crypto.subtle.exportKey('spki', wrapping.publicKey),
        ),
      ),
    }),
    signing: signing.privateKey,
    wrapping: wrapping.privateKey,
  };
}
export async function checkIdentity(identity: LocalIdentity): Promise<void> {
  deviceIdentity(identity.public);
  if (
    !(identity.signing instanceof CryptoKey) ||
    !(identity.wrapping instanceof CryptoKey) ||
    identity.signing.extractable ||
    identity.wrapping.extractable
  )
    throw new Error('Chaves locais inválidas.');
  const probe = crypto.randomUUID();
  await verify(
    identity.public.signing,
    await sign(identity.signing, probe),
    probe,
  );
  const wrapped = await sealTo(identity.public.wrapping, { probe }, [
    'identity-check',
  ]);
  if (
    object(await openFrom(identity.wrapping, wrapped, ['identity-check']))[
      'probe'
    ] !== probe
  )
    throw new Error('Chave local incompatível.');
}
export async function aesKey(secret: string): Promise<CryptoKey> {
  const bytes = base64(secret, 32);
  if (bytes.length !== 32)
    throw new Error('Chave de recuperação deve conter 256 bits aleatórios.');
  try {
    return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
  } finally {
    bytes.fill(0);
  }
}
async function sealAes(
  key: CryptoKey,
  value: unknown,
  context: unknown[],
): Promise<{ iv: string; ciphertext: string }> {
  const plaintext = encoder.encode(JSON.stringify(value));
  if (plaintext.length > 8000) throw new Error('Segredo excede o formato.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    return {
      iv: encode(iv),
      ciphertext: encode(
        new Uint8Array(
          await crypto.subtle.encrypt(
            {
              name: 'AES-GCM',
              iv,
              additionalData: encoder.encode(canonical(context)),
              tagLength: 128,
            },
            key,
            plaintext,
          ),
        ),
      ),
    };
  } finally {
    plaintext.fill(0);
  }
}
async function openAes(
  key: CryptoKey,
  envelope: { iv: string; ciphertext: string },
  context: unknown[],
): Promise<unknown> {
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64(envelope.iv, 12),
        additionalData: encoder.encode(canonical(context)),
        tagLength: 128,
      },
      key,
      base64(envelope.ciphertext, 8192),
    ),
  );
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
    ) as unknown;
  } finally {
    plaintext.fill(0);
  }
}
/** Standard RSA-OAEP key encapsulation and AES-GCM; never a message ratchet. */
export async function sealTo(
  publicKey: string,
  value: unknown,
  context: unknown[],
): Promise<SealedSecret> {
  const recipient = await crypto.subtle.importKey(
    'spki',
    base64(publicKey, 422),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  const raw = crypto.getRandomValues(new Uint8Array(32));
  try {
    const wrappedKey = encode(
      new Uint8Array(
        await crypto.subtle.encrypt(
          { name: 'RSA-OAEP', label: encoder.encode(canonical(context)) },
          recipient,
          raw,
        ),
      ),
    );
    return {
      ...(await sealAes(await aesKey(encode(raw)), value, context)),
      wrappedKey,
    };
  } finally {
    raw.fill(0);
  }
}
export async function openFrom(
  privateKey: CryptoKey,
  envelope: SealedSecret,
  context: unknown[],
): Promise<unknown> {
  const raw = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'RSA-OAEP', label: encoder.encode(canonical(context)) },
      privateKey,
      base64(envelope.wrappedKey, 384),
    ),
  );
  try {
    return await openAes(await aesKey(encode(raw)), envelope, context);
  } finally {
    raw.fill(0);
  }
}
export function keyContext(
  event: Pick<DirectoryEvent, 'accountId' | 'epoch'>,
  recipient: string,
): unknown[] {
  return ['0xdmme-device-secrets', 1, event.accountId, event.epoch, recipient];
}
export function keyring(
  value: unknown,
  expected: Pick<Keyring, 'accountId' | 'epoch'>,
): Keyring {
  const data = object(value);
  keys(data, ['accountId', 'epoch', 'keys']);
  if (
    uuid(data['accountId']) !== expected.accountId ||
    data['epoch'] !== expected.epoch ||
    !Array.isArray(data['keys']) ||
    data['keys'].length !== expected.epoch ||
    expected.epoch > directoryLimit
  )
    throw new Error('Segredos pertencem a outra versão ou conta.');
  const secrets = (data['keys'] as unknown[]).map((value) => {
    if (base64(value, 32).length !== 32) throw new Error('Segredo inválido.');
    return value as string;
  });
  return {
    accountId: expected.accountId,
    epoch: expected.epoch,
    keys: secrets,
  };
}
export async function deviceSecrets(
  identity: LocalIdentity,
  event: DirectoryEvent,
): Promise<Keyring> {
  const device = event.devices.find(
    (device) => device.id === identity.public.id,
  );
  if (
    !device ||
    canonical(deviceIdentity(identity.public)) !==
      canonical(
        deviceIdentity({
          id: device.id,
          name: device.name,
          signing: device.signing,
          wrapping: device.wrapping,
        }),
      )
  )
    throw new Error('Aparelho revogado ou chave não autorizada.');
  return keyring(
    await openFrom(
      identity.wrapping,
      device.envelope,
      keyContext(event, device.id),
    ),
    event,
  );
}
export async function createRecovery(
  accountId: string,
  secret: string,
): Promise<{ root: RecoveryRoot; signing: CryptoKey }> {
  const signing = await crypto.subtle.generateKey(signingAlgorithm, true, [
    'sign',
    'verify',
  ]);
  const wrapping = await crypto.subtle.generateKey(wrappingAlgorithm, true, [
    'encrypt',
    'decrypt',
  ]);
  const material = {
    signing: encode(
      new Uint8Array(
        await crypto.subtle.exportKey('pkcs8', signing.privateKey),
      ),
    ),
    wrapping: encode(
      new Uint8Array(
        await crypto.subtle.exportKey('pkcs8', wrapping.privateKey),
      ),
    ),
  };
  const root: RecoveryRoot = {
    signing: encode(
      new Uint8Array(await crypto.subtle.exportKey('raw', signing.publicKey)),
    ),
    wrapping: encode(
      new Uint8Array(await crypto.subtle.exportKey('spki', wrapping.publicKey)),
    ),
    capsule: await sealAes(await aesKey(secret), material, [
      '0xdmme-recovery-root',
      1,
      accountId,
    ]),
  };
  return { root, signing: signing.privateKey };
}
export async function recoverSecrets(
  event: DirectoryEvent,
  secret: string,
): Promise<{ ring: Keyring; signing: CryptoKey }> {
  try {
    const material = object(
      await openAes(await aesKey(secret), event.root.capsule, [
        '0xdmme-recovery-root',
        1,
        event.accountId,
      ]),
    );
    keys(material, ['signing', 'wrapping']);
    const signing = await crypto.subtle.importKey(
      'pkcs8',
      base64(material['signing'], 256),
      signingAlgorithm,
      false,
      ['sign'],
    );
    const wrapping = await crypto.subtle.importKey(
      'pkcs8',
      base64(material['wrapping'], 2048),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt'],
    );
    // Prove that the recovered authority is the pinned public root, before using it.
    await verify(
      event.root.signing,
      await sign(signing, '0xdmme-recovery-check'),
      '0xdmme-recovery-check',
    );
    const ring = keyring(
      await openFrom(wrapping, event.recovery, keyContext(event, 'recovery')),
      event,
    );
    return { ring, signing };
  } catch {
    throw new Error(
      'Recuperação rejeitada: chave, conta ou integridade inválida.',
    );
  }
}
export async function signEvent(
  event: DirectoryEvent,
  signing: CryptoKey,
): Promise<DirectoryEvent> {
  return { ...event, signature: await sign(signing, signedBody(event)) };
}
