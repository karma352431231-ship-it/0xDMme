import {
  AccountError,
  base64,
  boundedText,
  displayName,
  keys,
  object,
  uuid,
} from '../account/index.ts';
import { canonical, fingerprint } from '../devices/index.ts';
import { canonicalAddress, ecosystem } from '../wallet-identity/index.ts';
import type { Ecosystem } from '../wallet-identity/index.ts';
export const contactLimits = {
  page: 16,
  relationships: 256,
  incoming: 64,
  outgoing: 32,
  blocks: 256,
  global: 10000,
  globalBlocks: 10000,
  globalControls: 20000,
  requestsPerDay: 32,
} as const;
export type DiscoveryMode = 'wallet' | 'invite' | 'contacts';
export function discoveryMode(value: unknown): DiscoveryMode {
  if (value !== 'wallet' && value !== 'invite' && value !== 'contacts')
    throw new AccountError(400, 'Visibilidade inválida.');
  return value;
}
export interface WalletContact {
  ecosystem: Ecosystem;
  address: string;
}
export function walletContact(value: unknown): WalletContact {
  const data = object(value);
  keys(data, ['ecosystem', 'address']);
  try {
    const network = ecosystem(data['ecosystem']);
    return {
      ecosystem: network,
      address: canonicalAddress(network, data['address']),
    };
  } catch {
    throw new AccountError(
      400,
      'Wallet inválida. Confira o ecossistema e o endereço completo.',
    );
  }
}
export interface Peer extends WalletContact {
  accountId: string;
  name: string;
}
export function peer(value: unknown): Peer {
  const data = object(value);
  keys(data, ['accountId', 'ecosystem', 'address', 'name']);
  return {
    ...walletContact({
      ecosystem: data['ecosystem'],
      address: data['address'],
    }),
    accountId: uuid(data['accountId']),
    name: displayName(data['name']),
  };
}
export function token(value: unknown): string {
  return fingerprint(value);
}
export interface Invitation {
  owner: string;
  token: string;
}
export function invitation(value: unknown): Invitation {
  const data = object(value);
  keys(data, ['owner', 'token']);
  return { owner: uuid(data['owner']), token: token(data['token']) };
}
export function invitationLink(origin: string, value: Invitation): string {
  const valid = invitation(value);
  return `${new URL(origin).origin}/#contatos?convite=${valid.owner}.${valid.token}`;
}
export function readInvitation(text: string, origin: string): Invitation {
  const url = new URL(text);
  if (
    url.origin !== new URL(origin).origin ||
    url.pathname !== '/' ||
    url.search ||
    !url.hash.startsWith('#contatos?convite=')
  )
    throw new Error('Use um link de convite do 0xDMme desta origem.');
  const parts = url.hash.slice('#contatos?convite='.length).split('.');
  if (parts.length !== 2) throw new Error('Convite inválido.');
  return invitation({ owner: parts[0], token: parts[1] });
}
export interface ContactProof {
  directory: string;
  signature: string;
  payload: Record<string, unknown>;
}
export function contactProof(value: unknown): ContactProof {
  const data = object(value);
  keys(data, ['directory', 'signature', 'payload']);
  const signature = boundedText(data['signature'], 88);
  if (base64(signature, 64).length !== 64)
    throw new AccountError(400, 'Assinatura inválida.');
  return {
    directory: fingerprint(data['directory']),
    signature,
    payload: object(data['payload']),
  };
}
export function contactBody(
  accountId: string,
  deviceId: string,
  operation: string,
  proof: Pick<ContactProof, 'directory' | 'payload'>,
): string {
  return canonical([
    '0xdmme-contact-permission',
    1,
    accountId,
    deviceId,
    operation,
    proof.directory,
    proof.payload,
  ]);
}
export function revision(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 2147483646
  )
    throw new AccountError(400, 'Revisão inválida.');
  return value;
}
export type ContactList =
  'incoming' | 'outgoing' | 'approved' | 'blocked' | 'rejected';
export function contactList(value: unknown): ContactList {
  if (
    value !== 'incoming' &&
    value !== 'outgoing' &&
    value !== 'approved' &&
    value !== 'blocked' &&
    value !== 'rejected'
  )
    throw new AccountError(400, 'Lista inválida.');
  return value;
}
export interface AddressBookEntry extends WalletContact {
  version: 1;
  alias: string;
  accountId: string | null;
  identity: string | null;
  directory: string | null;
  identityRevision: number;
  removed: boolean;
}
export function addressBookEntry(value: unknown): AddressBookEntry {
  const data = object(value);
  keys(data, [
    'version',
    'ecosystem',
    'address',
    'alias',
    'accountId',
    'identity',
    'directory',
    'identityRevision',
    'removed',
  ]);
  if (data['version'] !== 1 || typeof data['removed'] !== 'boolean')
    throw new Error('Contato privado inválido.');
  return {
    ...walletContact({
      ecosystem: data['ecosystem'],
      address: data['address'],
    }),
    version: 1,
    alias: displayName(data['alias']),
    accountId: data['accountId'] === null ? null : uuid(data['accountId']),
    identity: data['identity'] === null ? null : fingerprint(data['identity']),
    directory:
      data['directory'] === null ? null : fingerprint(data['directory']),
    identityRevision: revision(data['identityRevision']),
    removed: data['removed'],
  };
}
