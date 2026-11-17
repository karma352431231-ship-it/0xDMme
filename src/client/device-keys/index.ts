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
import { walletRecovery } from '../../shared/wallet-recovery/index.ts';
import type { WalletRecovery } from '../../shared/wallet-recovery/index.ts';
import type {
  DeviceIdentity,
  DirectoryEvent,
  RecoveryBackup,
  RecoveryPair,
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
    throw new Error('Invalid local keys.');
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
    throw new Error('Incompatible local key.');
}
export async function aesKey(secret: string): Promise<CryptoKey> {
  const bytes = base64(secret, 32);
  if (bytes.length !== 32)
    throw new Error('The recovery key must contain 256 random bits.');
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
  if (plaintext.length > 8000) throw new Error('Secret exceeds the format.');
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
    throw new Error('Secrets belong to another version or account.');
  const secrets = (data['keys'] as unknown[]).map((value) => {
    if (base64(value, 32).length !== 32) throw new Error('Invalid secret.');
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
    throw new Error('Device revoked or key not authorized.');
  return keyring(
    await openFrom(
      identity.wrapping,
      device.envelope,
      keyContext(event, device.id),
    ),
    event,
  );
}
/** Fresh recovery authority keys: the exported private material to seal,
 * the public half for the root and the private signing key. */
async function generateAuthority(): Promise<{
  material: { signing: string; wrapping: string };
  public: Pick<RecoveryRoot, 'signing' | 'wrapping'>;
  signing: CryptoKey;
}> {
  const signing = await crypto.subtle.generateKey(signingAlgorithm, true, [
    'sign',
    'verify',
  ]);
  const wrapping = await crypto.subtle.generateKey(wrappingAlgorithm, true, [
    'encrypt',
    'decrypt',
  ]);
  return {
    material: {
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
    },
    public: {
      signing: encode(
        new Uint8Array(await crypto.subtle.exportKey('raw', signing.publicKey)),
      ),
      wrapping: encode(
        new Uint8Array(
          await crypto.subtle.exportKey('spki', wrapping.publicKey),
        ),
      ),
    },
    signing: signing.privateKey,
  };
}
export async function createRecovery(
  accountId: string,
  secret: string | CryptoKey,
  wallet?: WalletRecovery,
): Promise<{ root: RecoveryRoot; signing: CryptoKey }> {
  const created = await generateAuthority();
  const root: RecoveryRoot = {
    ...created.public,
    ...(wallet ? { wallet: walletRecovery(wallet) } : {}),
    capsule: await sealAes(
      await recoveryKey(secret),
      created.material,
      recoveryContext(accountId, wallet),
    ),
  };
  return { root, signing: created.signing };
}
/** What opens the recovery authority: the main wallet's secret by default,
 * a named backup wallet's, or the key two wallets derive together. */
export type RecoveryOpener =
  | { secret: string | CryptoKey; wallet?: WalletRecovery }
  | { secret: CryptoKey; pair: readonly [WalletRecovery, WalletRecovery] };
type Capsule = RecoveryRoot['capsule'];
function pairCapsule(
  event: DirectoryEvent,
  wallets: readonly [WalletRecovery, WalletRecovery],
): { capsule: Capsule; context: unknown[] } {
  const pair = event.pairs?.find(
    (entry) => canonical(entry.wallets) === canonical(wallets),
  );
  if (!pair) throw new Error('These wallets do not open recovery together.');
  return {
    capsule: pair.capsule,
    context: pairContext(event.accountId, pair),
  };
}
/** The capsule an opener unlocks, with the context it was sealed under. */
function capsuleFor(
  event: DirectoryEvent,
  opener: RecoveryOpener,
): { capsule: Capsule; context: unknown[] } {
  if ('pair' in opener) return pairCapsule(event, opener.pair);
  // Once pairs exist, no single wallet opens recovery.
  if (event.pairs) throw new Error('This account needs two wallets.');
  const wallet = opener.wallet;
  const backup = wallet
    ? event.backups?.find(
        (entry) => canonical(entry.wallet) === canonical(wallet),
      )
    : undefined;
  if (backup)
    return {
      capsule: backup.capsule,
      context: backupContext(event.accountId, backup.wallet),
    };
  if (wallet && canonical(wallet) !== canonical(event.root.wallet))
    throw new Error('This wallet does not open recovery.');
  return {
    capsule: event.root.capsule,
    context: recoveryContext(event.accountId, event.root.wallet),
  };
}
/** The recovery authority's exported private keys, proven to be the pinned
 * public root before anything uses them. */
async function openAuthority(
  event: DirectoryEvent,
  opener: RecoveryOpener,
): Promise<{ material: Record<string, unknown>; signing: CryptoKey }> {
  const { capsule, context } = capsuleFor(event, opener);
  const material = object(
    await openAes(await recoveryKey(opener.secret), capsule, context),
  );
  keys(material, ['signing', 'wrapping']);
  const signing = await crypto.subtle.importKey(
    'pkcs8',
    base64(material['signing'], 256),
    signingAlgorithm,
    false,
    ['sign'],
  );
  await verify(
    event.root.signing,
    await sign(signing, '0xdmme-recovery-check'),
    '0xdmme-recovery-check',
  );
  return { material, signing };
}
/** Opens recovery and returns every epoch's keys with the authority's
 * signing key. */
export async function openRecovery(
  event: DirectoryEvent,
  opener: RecoveryOpener,
): Promise<{ ring: Keyring; signing: CryptoKey }> {
  try {
    const { material, signing } = await openAuthority(event, opener);
    const wrapping = await crypto.subtle.importKey(
      'pkcs8',
      base64(material['wrapping'], 2048),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt'],
    );
    const ring = keyring(
      await openFrom(wrapping, event.recovery, keyContext(event, 'recovery')),
      event,
    );
    return { ring, signing };
  } catch {
    throw new Error('Recovery rejected: invalid key, account or integrity.');
  }
}
/** Opens recovery with the secret of the main wallet or, when `wallet` names
 * one, of a backup wallet. */
export function recoverSecrets(
  event: DirectoryEvent,
  secret: string | CryptoKey,
  wallet?: WalletRecovery,
): Promise<{ ring: Keyring; signing: CryptoKey }> {
  return openRecovery(event, wallet ? { secret, wallet } : { secret });
}
/**
 * Seals the recovery authority for one more wallet. `opener` already opens
 * recovery; the authority's signing key comes back so the caller can sign the
 * directory change that publishes the capsule.
 */
export async function sealBackup(input: {
  event: DirectoryEvent;
  opener: RecoveryOpener;
  backup: { wallet: WalletRecovery; secret: CryptoKey };
}): Promise<{ backup: RecoveryBackup; signing: CryptoKey }> {
  const { event } = input;
  let opened: Awaited<ReturnType<typeof openAuthority>>;
  try {
    opened = await openAuthority(event, input.opener);
  } catch {
    throw new Error('Recovery rejected: invalid key, account or integrity.');
  }
  const wallet = walletRecovery(input.backup.wallet);
  return {
    backup: {
      wallet,
      capsule: await sealAes(
        await recoveryKey(input.backup.secret),
        opened.material,
        backupContext(event.accountId, wallet),
      ),
    },
    signing: opened.signing,
  };
}
/** The authority's signing key, for a change that only removes a capsule. */
export async function recoverySigner(
  event: DirectoryEvent,
  secret: CryptoKey,
  wallet?: WalletRecovery,
): Promise<CryptoKey> {
  try {
    return (
      await openAuthority(event, wallet ? { secret, wallet } : { secret })
    ).signing;
  } catch {
    throw new Error('Recovery rejected: invalid key, account or integrity.');
  }
}
/** Which wallets open a new recovery authority: the main wallet alone with
 * at most one backup, or three wallets in pairs. */
export type RecoveryWallets =
  | {
      main: { wallet: WalletRecovery; secret: CryptoKey };
      backups: { wallet: WalletRecovery; secret: CryptoKey }[];
    }
  | {
      main: WalletRecovery;
      pairs: {
        wallets: readonly [WalletRecovery, WalletRecovery];
        salt: string;
        secret: CryptoKey;
      }[];
    };
/**
 * A new recovery authority sealed for the given wallets, to replace the
 * current one. With pairs, the root's own capsule repeats the first pair's:
 * the format requires one, and no single wallet can open it.
 */
export async function replaceRecovery(
  accountId: string,
  wallets: RecoveryWallets,
): Promise<{
  root: RecoveryRoot;
  backups: RecoveryBackup[];
  pairs: RecoveryPair[];
  signing: CryptoKey;
}> {
  const created = await generateAuthority();
  const seal = async (secret: CryptoKey, context: unknown[]) =>
    sealAes(await recoveryKey(secret), created.material, context);
  if ('pairs' in wallets) {
    const pairs: RecoveryPair[] = [];
    for (const pair of wallets.pairs) {
      const entry = {
        wallets: [
          walletRecovery(pair.wallets[0]),
          walletRecovery(pair.wallets[1]),
        ] as [WalletRecovery, WalletRecovery],
        salt: pair.salt,
      };
      pairs.push({
        ...entry,
        capsule: await seal(pair.secret, pairContext(accountId, entry)),
      });
    }
    const first = pairs[0];
    if (!first) throw new Error('Recovery pairs missing.');
    return {
      root: {
        ...created.public,
        wallet: walletRecovery(wallets.main),
        capsule: first.capsule,
      },
      backups: [],
      pairs,
      signing: created.signing,
    };
  }
  const main = walletRecovery(wallets.main.wallet);
  const backups: RecoveryBackup[] = [];
  for (const backup of wallets.backups) {
    const wallet = walletRecovery(backup.wallet);
    backups.push({
      wallet,
      capsule: await seal(backup.secret, backupContext(accountId, wallet)),
    });
  }
  return {
    root: {
      ...created.public,
      wallet: main,
      capsule: await seal(
        wallets.main.secret,
        recoveryContext(accountId, main),
      ),
    },
    backups,
    pairs: [],
    signing: created.signing,
  };
}
function backupContext(accountId: string, wallet: WalletRecovery): unknown[] {
  if (walletRecovery(wallet).accountId !== accountId)
    throw new Error('Settings belong to another account.');
  return ['0xdmme-recovery-backup', 1, accountId, walletRecovery(wallet)];
}
function pairContext(
  accountId: string,
  pair: { wallets: readonly [WalletRecovery, WalletRecovery]; salt: string },
): unknown[] {
  const wallets = pair.wallets.map((wallet) => walletRecovery(wallet));
  if (wallets.some((wallet) => wallet.accountId !== accountId))
    throw new Error('Settings belong to another account.');
  return ['0xdmme-recovery-pair', 1, accountId, wallets, pair.salt];
}
function recoveryContext(
  accountId: string,
  wallet?: WalletRecovery,
): unknown[] {
  if (wallet && walletRecovery(wallet).accountId !== accountId)
    throw new Error('Settings belong to another account.');
  return wallet
    ? ['0xdmme-recovery-root', 2, accountId, walletRecovery(wallet)]
    : ['0xdmme-recovery-root', 1, accountId];
}
async function recoveryKey(secret: string | CryptoKey): Promise<CryptoKey> {
  if (typeof secret === 'string') return aesKey(secret);
  if (
    !(secret instanceof CryptoKey) ||
    secret.extractable ||
    secret.algorithm.name !== 'AES-GCM' ||
    (secret.algorithm as AesKeyAlgorithm).length !== 256 ||
    !secret.usages.includes('encrypt') ||
    !secret.usages.includes('decrypt')
  )
    throw new Error('Invalid recovery key.');
  return secret;
}
export async function signEvent(
  event: DirectoryEvent,
  signing: CryptoKey,
): Promise<DirectoryEvent> {
  return { ...event, signature: await sign(signing, signedBody(event)) };
}
