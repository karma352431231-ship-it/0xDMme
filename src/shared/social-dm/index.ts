import { AccountError, keys, object, uuid } from '../account/index.ts';
import { directoryEvent } from '../devices/index.ts';
import type { DirectoryEvent } from '../devices/index.ts';
import { messagePacket } from '../messages/index.ts';
import type { MessagePacket } from '../messages/index.ts';
import { publicProfile } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';

export interface SocialRelation {
  peer: PublicProfile;
  requester: string;
  state: 'none' | 'pending' | 'approved' | 'rejected';
  revision: number;
  blocked: boolean;
  blockRevision: number;
  canSend: boolean;
}
export function socialRevision(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0)
    throw new AccountError(400, 'Revisão de DM inválida.');
  return input;
}
export function socialRelation(input: unknown): SocialRelation {
  const data = object(input);
  keys(data, [
    'peer',
    'requester',
    'state',
    'revision',
    'blocked',
    'blockRevision',
    'canSend',
  ]);
  if (
    !['none', 'pending', 'approved', 'rejected'].includes(
      String(data['state']),
    ) ||
    typeof data['blocked'] !== 'boolean' ||
    typeof data['canSend'] !== 'boolean'
  )
    throw new AccountError(400, 'Relação de DM inválida.');
  return {
    peer: publicProfile(data['peer']),
    requester: uuid(data['requester']),
    state: data['state'] as SocialRelation['state'],
    revision: socialRevision(data['revision']),
    blocked: data['blocked'],
    blockRevision: socialRevision(data['blockRevision']),
    canSend: data['canSend'],
  };
}
export function socialPage(input: unknown) {
  const data = object(input);
  keys(data, ['items', 'next']);
  if (!Array.isArray(data['items']) || data['items'].length > 16)
    throw new AccountError(400, 'Página de DMs inválida.');
  return {
    items: (data['items'] as unknown[]).map(socialRelation),
    next: data['next'] === null ? null : uuid(data['next']),
  };
}
/** Same verified directory protocol, with an independent public-context identity. */
export function socialDirectory(input: unknown): DirectoryEvent {
  const event = directoryEvent(input);
  if (
    event.root.wallet ||
    event.profile !== null ||
    event.linkId !== null ||
    !['initialize', 'revoke', 'recover'].includes(event.kind) ||
    event.devices.some((device) => device.name !== 'Aparelho de DMs')
  )
    throw new AccountError(
      400,
      'Diretório de DMs contém dados de outro contexto.',
    );
  return event;
}
export function socialPacket(input: unknown): MessagePacket {
  const packet = messagePacket(input);
  if (
    packet.kind === 'profile' ||
    packet.relation ||
    (packet.kind === 'attachment' && !packet.socialMedia)
  )
    throw new AccountError(
      400,
      'DM aceita texto, fotos, GIFs e voz declarados; perfil privado e outras operações são proibidos.',
    );
  return packet;
}
