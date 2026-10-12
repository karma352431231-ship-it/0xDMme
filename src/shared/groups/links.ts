import { AccountError, base64, keys, object, uuid } from '../account/index.ts';
import { revision } from '../contacts/index.ts';
import { canonical, eventHash, fingerprint, verify } from '../devices/index.ts';
import type { DirectoryEvent } from '../devices/index.ts';

/** The bearer secret stays in the URL fragment; only its hash is signed/persisted. */
export interface GroupLink {
  version: 1;
  id: string;
  groupId: string;
  head: string;
  actor: string;
  deviceId: string;
  directory: string;
  authorityRevision: number;
  tokenHash: string;
  signature: string;
}
export function groupLink(value: unknown): GroupLink {
  const d = object(value);
  keys(d, [
    'version',
    'id',
    'groupId',
    'head',
    'actor',
    'deviceId',
    'directory',
    'authorityRevision',
    'tokenHash',
    'signature',
  ]);
  const authorityRevision = revision(d['authorityRevision']);
  if (
    d['version'] !== 1 ||
    !authorityRevision ||
    base64(d['signature'], 64).length !== 64
  )
    throw new AccountError(400, 'Link de grupo inválido.');
  return {
    version: 1,
    id: uuid(d['id']),
    groupId: uuid(d['groupId']),
    head: fingerprint(d['head']),
    actor: uuid(d['actor']),
    deviceId: uuid(d['deviceId']),
    directory: fingerprint(d['directory']),
    authorityRevision,
    tokenHash: fingerprint(d['tokenHash']),
    signature: d['signature'] as string,
  };
}
export function groupLinkProof(link: GroupLink): string {
  const { signature: ignored, ...unsigned } = link;
  void ignored;
  return canonical(['0xdmme-group-link', 1, unsigned]);
}
export async function verifyGroupLink(
  link: GroupLink,
  directory: DirectoryEvent,
): Promise<void> {
  const signer = directory.devices.find(
    (device) => device.id === link.deviceId,
  );
  if (
    !signer ||
    directory.accountId !== link.actor ||
    directory.revision !== link.authorityRevision ||
    (await eventHash(directory)) !== link.directory
  )
    throw new AccountError(403, 'Link sem autoridade de aparelho verificada.');
  await verify(signer.signing, link.signature, groupLinkProof(link));
}
export function groupInvitationUrl(
  origin: string,
  groupId: string,
  token: string,
): string {
  return `${new URL(origin).origin}/#grupo=${uuid(groupId)}.${fingerprint(token)}`;
}
export function readGroupInvitation(value: string): {
  groupId: string;
  token: string;
} {
  const url = new URL(value);
  if (
    url.origin !== new URL('https://0xdmme.app').origin &&
    url.origin !== globalThis.location?.origin
  )
    throw new AccountError(400, 'Convite de outro site.');
  const parts = url.hash.slice('#grupo='.length).split('.');
  if (!url.hash.startsWith('#grupo=') || parts.length !== 2)
    throw new AccountError(400, 'Link de grupo inválido.');
  return { groupId: uuid(parts[0]), token: fingerprint(parts[1]) };
}
