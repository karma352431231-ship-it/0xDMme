import { keys, object } from '../../shared/account/index.ts';
import { deviceIdentity } from '../../shared/devices/index.ts';
import { attachmentRef } from '../../shared/attachments/index.ts';
import { applicationOrigin } from '../application-origin/index.ts';
import { checkIdentity, createIdentity } from '../device-keys/index.ts';
import type { LocalIdentity } from '../device-keys/index.ts';
import { openFile, sealFile } from '../attachment-crypto/index.ts';
import type { SealedFile } from '../attachment-crypto/index.ts';
import { FeasibilityStore } from './storage.ts';

const plaintext = '0xDMme synthetic installed-app feasibility fixture v1';
const lifetime = 30 * 60 * 1000;
const lockName = '0xdmme-mobile-feasibility';
interface Fixture {
  version: 1;
  created: number;
  identity: LocalIdentity;
  sealed: SealedFile;
}
export interface FeasibilityResult {
  restored: boolean;
  applicationOrigin: string;
}

function fixture(value: unknown): Fixture {
  const record = object(value);
  keys(record, ['version', 'created', 'identity', 'sealed']);
  if (
    record['version'] !== 1 ||
    typeof record['created'] !== 'number' ||
    !Number.isSafeInteger(record['created']) ||
    record['created'] > Date.now() ||
    Date.now() - record['created'] > lifetime
  )
    throw new Error('Test fixture is invalid or expired. Clear it explicitly.');
  return {
    version: 1,
    created: record['created'],
    identity: storedIdentity(record['identity']),
    sealed: storedCiphertext(record['sealed']),
  };
}

function storedIdentity(value: unknown): LocalIdentity {
  const identity = object(value);
  keys(identity, ['public', 'signing', 'wrapping']);
  const signing = identity['signing'],
    wrapping = identity['wrapping'];
  if (!(signing instanceof CryptoKey) || !(wrapping instanceof CryptoKey))
    throw new Error('Stored test keys are unavailable.');
  return { public: deviceIdentity(identity['public']), signing, wrapping };
}

function storedCiphertext(value: unknown): SealedFile {
  const sealed = object(value);
  keys(sealed, ['file', 'bytes']);
  const file = object(sealed['file']);
  keys(file, ['ref', 'encryption']);
  if (
    typeof file['encryption'] !== 'string' ||
    file['encryption'].length > 4096 ||
    !(sealed['bytes'] instanceof Uint8Array) ||
    sealed['bytes'].length > 4096
  )
    throw new Error('Stored test ciphertext is invalid.');
  return {
    file: {
      ref: attachmentRef(file['ref'], 4096),
      encryption: file['encryption'],
    },
    bytes: Uint8Array.from(sealed['bytes']),
  };
}

async function verify(value: Fixture): Promise<void> {
  await checkIdentity(value.identity);
  const bytes = await openFile(value.sealed.file, value.sealed.bytes, 4096);
  if (new TextDecoder('utf-8', { fatal: true }).decode(bytes) !== plaintext)
    throw new Error('Synthetic fixture did not decrypt correctly.');
}

/** Measures real engine/key-cloning support. It never contacts an API or wallet. */
export async function runMobileFeasibility(
  signal: AbortSignal,
): Promise<FeasibilityResult> {
  if (!globalThis.isSecureContext || !navigator.locks)
    throw new Error('A secure context and Web Locks are required.');
  return navigator.locks.request(lockName, { signal }, async () => {
    const store = new FeasibilityStore();
    const previous = await store.read(signal);
    if (previous !== undefined) {
      await verify(fixture(previous));
      signal.throwIfAborted();
      return { restored: true, applicationOrigin: applicationOrigin() };
    }
    const value: Fixture = {
      version: 1,
      created: Date.now(),
      identity: await createIdentity(
        crypto.randomUUID(),
        'Synthetic mobile fixture',
      ),
      sealed: await sealFile(new TextEncoder().encode(plaintext), 4096),
    };
    await verify(value);
    signal.throwIfAborted();
    await store.write(value, signal);
    await verify(fixture(await store.read(signal)));
    signal.throwIfAborted();
    return { restored: false, applicationOrigin: applicationOrigin() };
  });
}

export async function clearMobileFeasibility(
  signal: AbortSignal,
): Promise<void> {
  if (!navigator.locks) throw new Error('Web Locks are required.');
  await navigator.locks.request(lockName, { signal }, () =>
    new FeasibilityStore().clear(signal),
  );
}

async function alterFixture(
  signal: AbortSignal,
  alter: (value: Fixture) => Fixture,
): Promise<void> {
  await navigator.locks.request(lockName, { signal }, async () => {
    const store = new FeasibilityStore();
    const value = fixture(await store.read(signal));
    await verify(value);
    signal.throwIfAborted();
    await store.write(alter(value), signal);
  });
}

/** Negative controls affect only this explicitly synthetic store. */
export function expireMobileFeasibility(signal: AbortSignal): Promise<void> {
  return alterFixture(signal, (value) => ({
    ...value,
    created: Date.now() - lifetime - 1_000,
  }));
}

export function corruptMobileFeasibility(signal: AbortSignal): Promise<void> {
  return alterFixture(signal, (value) => {
    const bytes = Uint8Array.from(value.sealed.bytes);
    const first = bytes[0];
    if (first === undefined) throw new Error('Synthetic ciphertext is empty.');
    bytes[0] = first ^ 1;
    return { ...value, sealed: { ...value.sealed, bytes } };
  });
}
