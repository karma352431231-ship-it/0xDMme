import { base64, encode } from '../account/index.ts';
import { directoryEvent, eventBytes, identityOf, reject } from './format.ts';
import type { DirectoryEvent, DeviceIdentity, LinkCode } from './format.ts';
import type { WalletRecovery } from '../wallet-recovery/index.ts';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const data = value as Record<string, unknown>;
    return `{${Object.keys(data)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(data[key])}`)
      .join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) reject();
  return serialized;
}
export function signedBody(event: DirectoryEvent): string {
  const { signature: _signature, ...body } = event;
  void _signature;
  return canonical(['0xdmme-device-directory', body]);
}
export async function digest(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
export async function eventHash(event: DirectoryEvent): Promise<string> {
  return digest(canonical(event));
}
export async function verify(
  publicKey: string,
  signature: string,
  message: string,
): Promise<void> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      base64(publicKey, 65),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    if (
      !(await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        base64(signature, 64),
        new TextEncoder().encode(message),
      ))
    )
      reject();
  } catch {
    reject('Invalid device signature.');
  }
}
export async function sign(key: CryptoKey, message: string): Promise<string> {
  return encode(
    new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        new TextEncoder().encode(message),
      ),
    ),
  );
}
export function linkProof(code: LinkCode): string {
  return canonical(['0xdmme-device-link', code]);
}
export function profileProof(
  accountId: string,
  deviceId: string,
  head: string,
  profile: unknown,
): string {
  return canonical([
    '0xdmme-device-profile',
    accountId,
    deviceId,
    head,
    profile,
  ]);
}
function same(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}
function membership(event: DirectoryEvent): void {
  const ids = [...event.devices.map((device) => device.id), ...event.revoked];
  if (new Set(ids).size !== ids.length || ids.length > 32) reject();
  if (
    new Set(event.devices.map((device) => device.signing)).size !==
      event.devices.length ||
    new Set(event.devices.map((device) => device.wrapping)).size !==
      event.devices.length
  )
    reject();
}
function additions(
  previous: DirectoryEvent,
  event: DirectoryEvent,
): DeviceIdentity[] {
  const added = event.devices.filter(
    (device) => !previous.devices.some((known) => known.id === device.id),
  );
  if (added.some((device) => previous.revoked.includes(device.id)))
    reject('A revoked identifier cannot be reactivated.');
  for (const device of event.devices) {
    const known = previous.devices.find(
      (candidate) => candidate.id === device.id,
    );
    if (known && !same(identityOf(known), identityOf(device)))
      reject('Device keys changed.');
  }
  return added;
}
function walletKey(wallet: { ecosystem: string; address: string }): string {
  return `${wallet.ecosystem}:${wallet.address}`;
}
/** The one configuration each wallet uses across the pairs, by wallet. */
function pairConfigurations(event: DirectoryEvent): Map<string, string> {
  const configs = new Map<string, string>();
  for (const wallet of (event.pairs ?? []).flatMap((pair) => pair.wallets)) {
    const known = configs.get(walletKey(wallet)) ?? canonical(wallet);
    if (known !== canonical(wallet) || wallet.accountId !== event.accountId)
      reject('Invalid recovery wallets.');
    configs.set(walletKey(wallet), known);
  }
  return configs;
}
/** Every pair of three distinct wallets, each in canonical order. The main
 * wallet is one of the three and every wallet keeps one configuration. */
function validatePairs(event: DirectoryEvent, main: WalletRecovery): void {
  const pairs = event.pairs;
  if (!pairs) return;
  if (event.backups) reject('Invalid recovery wallets.');
  const configs = pairConfigurations(event);
  const listed = new Set(
    pairs.map((pair) => pair.wallets.map(walletKey).join('|')),
  );
  const ordered = pairs.every(
    (pair) => walletKey(pair.wallets[0]) < walletKey(pair.wallets[1]),
  );
  if (
    configs.size !== 3 ||
    listed.size !== 3 ||
    !ordered ||
    configs.get(walletKey(main)) !== canonical(main)
  )
    reject('Invalid recovery wallets.');
}
/** Backup capsules belong to this account and to wallets other than the main
 * one, each listed once. Backups and pairs exist only beside a wallet-bound
 * root, and never together. */
function validateRecoveryWallets(event: DirectoryEvent): void {
  if (!hasRecoveryWallets(event)) return;
  const main = event.root.wallet;
  if (!main) reject('Recovery wallets need wallet recovery.');
  validatePairs(event, main);
  const wallets = [main, ...(event.backups ?? []).map((b) => b.wallet)];
  if (
    wallets.some((wallet) => wallet.accountId !== event.accountId) ||
    new Set(wallets.map(walletKey)).size !== wallets.length
  )
    reject('Invalid backup wallets.');
}
/** Signed by the authority, with no linking code and no profile change. */
function signedOnlyByRecovery(event: DirectoryEvent): boolean {
  return (
    event.signer === 'recovery' &&
    event.linkId === null &&
    event.profile === null
  );
}
function sameKeysAndDevices(
  previous: DirectoryEvent,
  event: DirectoryEvent,
): boolean {
  return (
    event.epoch === previous.epoch &&
    same(previous.devices, event.devices) &&
    same(previous.recovery, event.recovery)
  );
}
function hasPairs(...events: DirectoryEvent[]): boolean {
  return events.some((event) => event.pairs !== undefined);
}
function hasRecoveryWallets(event: DirectoryEvent): boolean {
  return event.backups !== undefined || event.pairs !== undefined;
}
/** Only the recovery authority changes which backup wallet opens it. Devices,
 * keys and the root itself stay exactly as they were. */
function validateReseal(previous: DirectoryEvent, event: DirectoryEvent): void {
  if (
    !signedOnlyByRecovery(event) ||
    hasPairs(previous, event) ||
    !sameKeysAndDevices(previous, event) ||
    same(previous.backups ?? [], event.backups ?? [])
  )
    reject('Invalid backup wallet change.');
}
/** The previous recovery authority hands over to new keys in a new epoch.
 * The device list does not change; which wallets open the new authority may. */
function validateReroot({ previous, event, added, removed }: Change): void {
  if (
    !previous.root.wallet ||
    !event.root.wallet ||
    event.signer !== 'recovery' ||
    added.length ||
    removed.length ||
    event.epoch !== previous.epoch + 1 ||
    event.linkId !== null ||
    previous.root.signing === event.root.signing ||
    previous.root.wrapping === event.root.wrapping
  )
    reject('Invalid recovery replacement.');
}
/** True when the event is a change of recovery wallets, which is then
 * complete. Every other kind must leave backups and pairs as they were. */
function recoveryWalletsChanged(change: Change): boolean {
  const { previous, event } = change;
  if (event.kind === 'reseal') {
    validateReseal(previous, event);
    return true;
  }
  if (event.kind === 'reroot') {
    validateReroot(change);
    return true;
  }
  if (
    !same(previous.backups ?? [], event.backups ?? []) ||
    !same(previous.pairs ?? [], event.pairs ?? [])
  )
    reject('Recovery wallets change only through the recovery authority.');
  return false;
}
function transition(previous: DirectoryEvent, event: DirectoryEvent): void {
  validateContinuity(previous, event);
  const added = additions(previous, event);
  const removed = previous.devices
    .filter(
      (device) => !event.devices.some((current) => current.id === device.id),
    )
    .map((device) => device.id);
  if (!same(event.revoked, [...previous.revoked, ...removed].sort())) reject();
  if (recoveryWalletsChanged({ previous, event, added, removed })) return;
  if (event.kind === 'migrate') {
    validateMigration({ previous, event, added, removed });
    return;
  }
  if (event.kind === 'link') {
    validateLink({ previous, event, added, removed });
    return;
  }
  if (event.linkId !== null || event.epoch !== previous.epoch + 1) reject();
  validateRotation({ previous, event, added, removed });
  if (event.kind === 'initialize') reject();
}
/** The two kinds signed by the previous authority to introduce a new root. */
export function replacesRoot(event: DirectoryEvent): boolean {
  return event.kind === 'migrate' || event.kind === 'reroot';
}
function validateContinuity(
  previous: DirectoryEvent,
  event: DirectoryEvent,
): void {
  if (
    (!replacesRoot(event) && !same(previous.root, event.root)) ||
    event.accountId !== previous.accountId ||
    event.revision !== previous.revision + 1
  )
    reject();
}
interface Change {
  previous: DirectoryEvent;
  event: DirectoryEvent;
  added: DeviceIdentity[];
  removed: string[];
}
function validateMigration({ previous, event, added, removed }: Change): void {
  if (
    previous.root.wallet ||
    !event.root.wallet ||
    event.root.wallet.accountId !== event.accountId ||
    event.signer !== 'recovery' ||
    added.length ||
    removed.length ||
    event.epoch !== previous.epoch + 1 ||
    event.linkId !== null ||
    same(previous.root, event.root)
  )
    reject('Invalid recovery migration.');
}
function validateLink({ previous, event, added, removed }: Change): void {
  if (
    added.length !== 1 ||
    removed.length ||
    !event.linkId ||
    event.signer === 'recovery' ||
    event.epoch !== previous.epoch ||
    event.profile !== null ||
    !same(previous.recovery, event.recovery)
  )
    reject();
  for (const device of previous.devices)
    if (
      !same(
        device,
        event.devices.find((current) => current.id === device.id),
      )
    )
      reject();
}
function validateRotation({ event, added, removed }: Change): void {
  if (event.kind === 'revoke') {
    if (
      added.length ||
      removed.length !== 1 ||
      event.signer === 'recovery' ||
      removed.includes(event.signer)
    )
      reject();
    return;
  }
  if (event.signer !== 'recovery' || added.length !== 1) reject();
}
function validateInitial(event: DirectoryEvent): void {
  if (
    event.kind !== 'initialize' ||
    event.revision !== 1 ||
    event.epoch !== 1 ||
    event.previous !== null ||
    event.signer !== 'recovery' ||
    event.devices.length !== 1 ||
    event.revoked.length ||
    event.linkId !== null ||
    hasRecoveryWallets(event)
  )
    reject();
}
async function validatePublicKeys(
  event: DirectoryEvent,
  previous: DirectoryEvent | null,
): Promise<void> {
  const recipients = previous
    ? event.devices.filter(
        (device) => !previous.devices.some((known) => known.id === device.id),
      )
    : [...event.devices, event.root];
  if (previous && replacesRoot(event)) recipients.push(event.root);
  for (const recipient of recipients) {
    const wrapping = await crypto.subtle.importKey(
      'spki',
      base64(recipient.wrapping, 422),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
    if ((wrapping.algorithm as RsaHashedKeyAlgorithm).modulusLength !== 3072)
      reject();
    await crypto.subtle.importKey(
      'raw',
      base64(recipient.signing, 65),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  }
}
export async function verifyTransition(
  previous: DirectoryEvent | null,
  input: unknown,
): Promise<DirectoryEvent> {
  const event = directoryEvent(input);
  if (event.root.wallet && event.root.wallet.accountId !== event.accountId)
    reject('Recovery belongs to another account.');
  if (new TextEncoder().encode(canonical(event)).length > eventBytes)
    reject('Directory exceeds the metadata budget.');
  membership(event);
  validateRecoveryWallets(event);
  let publicKey = event.root.signing;
  if (!previous) {
    validateInitial(event);
  } else {
    transition(previous, event);
    if (event.previous !== (await eventHash(previous)))
      reject('Directory conflict or outdated version.');
    if (replacesRoot(event)) publicKey = previous.root.signing;
    if (event.signer !== 'recovery') {
      const signer = previous.devices.find(
        (device) => device.id === event.signer,
      );
      if (!signer) reject('Device unauthorized or revoked.');
      publicKey = signer.signing;
    }
  }
  await verify(publicKey, event.signature, signedBody(event));
  await validatePublicKeys(event, previous);
  return event;
}
export async function verifyHistory(
  events: unknown[],
  accountId: string,
): Promise<DirectoryEvent | null> {
  let current: DirectoryEvent | null = null;
  for (const event of events) {
    current = await verifyTransition(current, event);
    if (current.accountId !== accountId)
      reject('Directory belongs to another account.');
  }
  return current;
}
