import { AccountError, keys, object, uuid } from '../account/index.ts';
import { canonical } from '../devices/index.ts';
import { publicProfile, publicProfileProof } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';
import { pendingPublicAvatar } from '../public-avatar/index.ts';
import type { PendingPublicAvatar } from '../public-avatar/index.ts';
import { publicAvatar } from '../public-media/index.ts';

export const communityPageSize = 24;
export const communityPolicy =
  'Nudez artística em pinturas é permitida. Atos sexuais explícitos são proibidos, inclusive pintados, desenhados ou gerados por IA. Fora da exceção para pinturas, genitais e seios femininos expostos são proibidos. Biquíni e roupa curta são permitidos. Regras locais não podem relaxar essa política.';
export type CommunityRole = 'owner' | 'moderator' | 'participant';
export interface CommunityMeta {
  name: string;
  description: string;
  rules: string;
}
export interface Community extends CommunityMeta {
  id: string;
  revision: number;
  archived: boolean;
  avatar: string | null;
  owner: PublicProfile | null;
  followers: number;
}
export interface CommunityPage {
  items: Community[];
  next: string | null;
}
export interface Sanction {
  id: string;
  target: PublicProfile | null;
  reason: string;
  until: string | null;
  lifted: boolean;
  appeal: string | null;
  decision: string | null;
}
export interface CommunityState {
  community: Community;
  role: CommunityRole;
  following: boolean;
  canPost: boolean;
  pendingPhoto: PendingPublicAvatar | null;
  sanction: Sanction | null;
  transfer: { id: string; target: PublicProfile } | null;
}
export interface CommunityReport {
  id: string;
  reason: string;
  resolved: boolean;
  decision: string | null;
}
export function communityText(
  value: unknown,
  maximum: number,
  empty = false,
): string {
  if (typeof value !== 'string' || value.length > maximum)
    throw new AccountError(400, 'Texto da comunidade inválido ou muito longo.');
  const result = value.replaceAll('\r\n', '\n').trim();
  if (
    (!empty && !result) ||
    /[\p{Cc}\p{Cf}]/u.test(result.replaceAll('\n', '').replaceAll('\t', ''))
  )
    throw new AccountError(400, 'Texto da comunidade inválido.');
  return result;
}
export function communityMeta(value: unknown): CommunityMeta {
  const data = object(value);
  keys(data, ['name', 'description', 'rules']);
  const name = communityText(data['name'], 100);
  if (/[\n\t]/u.test(name))
    throw new AccountError(400, 'Nome deve ocupar uma linha.');
  return {
    name,
    description: communityText(data['description'], 1000, true),
    rules: communityText(data['rules'], 4000, true),
  };
}
export function communityRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new AccountError(400, 'Revisão da comunidade inválida.');
  return value;
}
export function communityBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean')
    throw new AccountError(400, 'Escolha inválida.');
  return value;
}
export function communityCursor(value: unknown): string | null {
  return value === null ? null : uuid(value);
}
export function community(value: unknown): Community {
  const d = object(value);
  keys(d, [
    'id',
    'name',
    'description',
    'rules',
    'revision',
    'archived',
    'avatar',
    'owner',
    'followers',
  ]);
  if (
    typeof d['followers'] !== 'number' ||
    !Number.isSafeInteger(d['followers']) ||
    d['followers'] < 0
  )
    throw new AccountError(400, 'Comunidade pública inválida.');
  const id = uuid(d['id']);
  return {
    ...communityMeta({
      name: d['name'],
      description: d['description'],
      rules: d['rules'],
    }),
    id,
    revision: communityRevision(d['revision']),
    archived: communityBoolean(d['archived']),
    avatar: publicAvatar(d['avatar'], 'community-photo', id),
    owner: d['owner'] === null ? null : publicProfile(d['owner']),
    followers: d['followers'],
  };
}
export function communityPage(value: unknown): CommunityPage {
  const d = object(value);
  keys(d, ['items', 'next']);
  return {
    items: communityArray(d['items']).map(community),
    next: communityCursor(d['next']),
  };
}
export function communityArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > communityPageSize)
    throw new AccountError(400, 'Página da comunidade inválida.');
  return value;
}
function optionalText(value: unknown, maximum: number): string | null {
  return value === null ? null : communityText(value, maximum);
}
export function sanction(value: unknown): Sanction {
  const d = object(value);
  keys(d, ['id', 'target', 'reason', 'until', 'lifted', 'appeal', 'decision']);
  const until = optionalText(d['until'], 32);
  if (
    until !== null &&
    (!Number.isFinite(Date.parse(until)) ||
      new Date(until).toISOString() !== until)
  )
    throw new AccountError(400, 'Duração inválida.');
  return {
    id: uuid(d['id']),
    target: d['target'] === null ? null : publicProfile(d['target']),
    reason: communityText(d['reason'], 1000),
    until,
    lifted: communityBoolean(d['lifted']),
    appeal: optionalText(d['appeal'], 2000),
    decision: optionalText(d['decision'], 1000),
  };
}
export function communityState(value: unknown): CommunityState {
  const d = object(value);
  keys(d, [
    'community',
    'role',
    'following',
    'canPost',
    'pendingPhoto',
    'sanction',
    'transfer',
  ]);
  const role = d['role'];
  if (role !== 'owner' && role !== 'moderator' && role !== 'participant')
    throw new AccountError(400, 'Função inválida.');
  let transfer: CommunityState['transfer'] = null;
  if (d['transfer'] !== null) {
    const t = object(d['transfer']);
    keys(t, ['id', 'target']);
    transfer = { id: uuid(t['id']), target: publicProfile(t['target']) };
  }
  return {
    community: community(d['community']),
    role,
    following: communityBoolean(d['following']),
    canPost: communityBoolean(d['canPost']),
    pendingPhoto: pendingPublicAvatar(d['pendingPhoto']),
    sanction: d['sanction'] === null ? null : sanction(d['sanction']),
    transfer,
  };
}
export function communityReport(value: unknown): CommunityReport {
  const d = object(value);
  keys(d, ['id', 'reason', 'resolved', 'decision']);
  return {
    id: uuid(d['id']),
    reason: communityText(d['reason'], 1000),
    resolved: communityBoolean(d['resolved']),
    decision: optionalText(d['decision'], 1000),
  };
}
export const communityProof = publicProfileProof;
export function communityBody(
  account: string,
  device: string,
  operation: string,
  proof: { directory: string; payload: Record<string, unknown> },
): string {
  return canonical(['0xdmme-community', 1, account, device, operation, proof]);
}
