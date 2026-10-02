import { base64, encode } from '../account/index.ts';
import { directoryEvent, eventBytes, identityOf, reject } from './format.ts';
import type { DirectoryEvent, DeviceIdentity, LinkCode } from './format.ts';

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
    reject('Assinatura de dispositivo inválida.');
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
    reject('Um identificador revogado não pode ser reativado.');
  for (const device of event.devices) {
    const known = previous.devices.find(
      (candidate) => candidate.id === device.id,
    );
    if (known && !same(identityOf(known), identityOf(device)))
      reject('Chaves de aparelho alteradas.');
  }
  return added;
}
function transition(previous: DirectoryEvent, event: DirectoryEvent): void {
  if (
    !same(previous.root, event.root) ||
    event.accountId !== previous.accountId ||
    event.revision !== previous.revision + 1
  )
    reject();
  const added = additions(previous, event);
  const removed = previous.devices
    .filter(
      (device) => !event.devices.some((current) => current.id === device.id),
    )
    .map((device) => device.id);
  if (!same(event.revoked, [...previous.revoked, ...removed].sort())) reject();
  if (event.kind === 'link') {
    validateLink({ previous, event, added, removed });
    return;
  }
  if (event.linkId !== null || event.epoch !== previous.epoch + 1) reject();
  validateRotation({ previous, event, added, removed });
  if (event.kind === 'initialize') reject();
}
interface Change {
  previous: DirectoryEvent;
  event: DirectoryEvent;
  added: DeviceIdentity[];
  removed: string[];
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
    event.linkId !== null
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
  if (new TextEncoder().encode(canonical(event)).length > eventBytes)
    reject('Diretório excede o orçamento de metadados.');
  membership(event);
  let publicKey = event.root.signing;
  if (!previous) {
    validateInitial(event);
  } else {
    transition(previous, event);
    if (event.previous !== (await eventHash(previous)))
      reject('Conflito ou versão antiga do diretório.');
    if (event.signer !== 'recovery') {
      const signer = previous.devices.find(
        (device) => device.id === event.signer,
      );
      if (!signer) reject('Aparelho sem autorização ou revogado.');
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
      reject('Diretório pertence a outra conta.');
  }
  return current;
}
