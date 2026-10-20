import { communitySlug } from '../community-address/index.ts';
import { communityClassification } from '../community-classification/index.ts';
import type { CommunityClassification } from '../community-classification/index.ts';
import { communityName } from '../community-name/index.ts';
import { mentionText } from '../public-mentions/index.ts';
import { AccountError, keys, object, uuid } from '../account/index.ts';
import { canonical } from '../devices/index.ts';
import { publicProfile, publicProfileProof } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';
import { pendingPublicAvatar } from '../public-avatar/index.ts';
import type { PendingPublicAvatar } from '../public-avatar/index.ts';
import { publicAvatar } from '../public-media/index.ts';

export const communityPageSize = 24;
export const communityPolicy = 'community.content-policy';
export type CommunityRole = 'owner' | 'moderator' | 'participant';
export interface CommunityMeta {
  slug?: string | null;
  name: string;
  description: string;
  rules: string;
}
export interface Community extends CommunityMeta {
  classification?: CommunityClassification;
  id: string;
  revision: number;
  archived: boolean;
  avatar: string | null;
  banner?: string | null;
  owner: PublicProfile | null;
  followers: number;
  createdAt?: string | null;
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
  pendingBanner?: PendingPublicAvatar | null;
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
    throw new AccountError(400, 'Community text invalid or too long.');
  const result = value.replaceAll('\r\n', '\n').trim();
  if (
    (!empty && !result) ||
    /[\p{Cc}\p{Cf}]/u.test(result.replaceAll('\n', '').replaceAll('\t', ''))
  )
    throw new AccountError(400, 'Invalid community text.');
  return result;
}
export function communityMeta(value: unknown): CommunityMeta {
  const data = object(value);
  keys(data, ['name', 'description', 'rules']);
  const name = communityText(data['name'], 100);
  if (/[\n\t]/u.test(name))
    throw new AccountError(400, 'The name must be one line.');
  return {
    name: communityName(name),
    description: communityMentionText(data['description'], 1000, true),
    rules: communityText(data['rules'], 4000, true),
  };
}
export function communityRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new AccountError(400, 'Invalid community revision.');
  return value;
}
export function communityBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean')
    throw new AccountError(400, 'Invalid choice.');
  return value;
}
export function communityCursor(value: unknown): string | null {
  return value === null ? null : uuid(value);
}
function classificationFields(data: Record<string, unknown>) {
  return Object.hasOwn(data, 'classification')
    ? { classification: communityClassification(data['classification']) }
    : {};
}
function addressFields(data: Record<string, unknown>): {
  slug?: string | null;
} {
  if (!Object.hasOwn(data, 'slug')) return {};
  return { slug: data['slug'] === null ? null : communitySlug(data['slug']) };
}
export function community(value: unknown): Community {
  const d = object(value),
    classification = classificationFields(d);
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
    ...Object.keys(classification),
    ...(Object.hasOwn(d, 'banner') ? ['banner'] : []),
    ...(Object.hasOwn(d, 'slug') ? ['slug'] : []),
    ...(Object.hasOwn(d, 'createdAt') ? ['createdAt'] : []),
  ]);
  if (
    typeof d['followers'] !== 'number' ||
    !Number.isSafeInteger(d['followers']) ||
    d['followers'] < 0
  )
    throw new AccountError(400, 'Invalid public community.');
  const id = uuid(d['id']);
  return {
    ...communityMeta({
      name: d['name'],
      description: d['description'],
      rules: d['rules'],
    }),
    id,
    ...addressFields(d),
    revision: communityRevision(d['revision']),
    archived: communityBoolean(d['archived']),
    avatar: publicAvatar(d['avatar'], 'community-photo', id),
    ...(Object.hasOwn(d, 'banner')
      ? { banner: publicAvatar(d['banner'], 'community-banner', id) }
      : {}),
    owner: d['owner'] === null ? null : publicProfile(d['owner']),
    followers: d['followers'],
    ...classification,
    ...(Object.hasOwn(d, 'createdAt')
      ? { createdAt: communityDate(d['createdAt']) }
      : {}),
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
    throw new AccountError(400, 'Invalid community page.');
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
    throw new AccountError(400, 'Invalid duration.');
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
    ...(Object.hasOwn(d, 'pendingBanner') ? ['pendingBanner'] : []),
    'sanction',
    'transfer',
  ]);
  const role = d['role'];
  if (role !== 'owner' && role !== 'moderator' && role !== 'participant')
    throw new AccountError(400, 'Invalid role.');
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
    ...(Object.hasOwn(d, 'pendingBanner')
      ? { pendingBanner: pendingPublicAvatar(d['pendingBanner']) }
      : {}),
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

function communityDate(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length !== 24 ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new AccountError(400, 'Invalid community date.');
  return value;
}
export function communityMentionText(
  value: unknown,
  maximum: number,
  empty = false,
): string {
  const text = communityText(value, maximum + 8000, empty);
  return mentionText(text, maximum);
}
