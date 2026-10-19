import { AccountError, keys, object, uuid } from '../account/index.ts';
import { communityArray, communityRevision } from '../communities/index.ts';

export interface CommunityBadge {
  kind: 'owner' | 'moderator' | 'new' | 'custom';
  label: string;
  id: string | null;
}
export interface CustomBadge {
  id: string;
  label: string;
  revision: number;
}
export const newMemberWindowMs = 2 * 24 * 60 * 60 * 1000;
export function isNewMember(joinedAt: Date | null, now = Date.now()): boolean {
  return (
    joinedAt !== null &&
    now >= joinedAt.getTime() &&
    now - joinedAt.getTime() < newMemberWindowMs
  );
}
export function badgeLabel(value: unknown): string {
  if (typeof value !== 'string' || value.length > 32)
    throw new AccountError(400, 'Badge invalid or too long.');
  const label = value.trim();
  if (!label || /\p{Cc}|(?!\u200D)\p{Cf}/u.test(label))
    throw new AccountError(
      400,
      'The badge must be one line without invisible control characters.',
    );
  return label;
}
export function customBadge(value: unknown): CustomBadge {
  const data = object(value);
  keys(data, ['id', 'label', 'revision']);
  return {
    id: uuid(data['id']),
    label: badgeLabel(data['label']),
    revision: communityRevision(data['revision']),
  };
}
export function communityBadges(value: unknown): CommunityBadge[] {
  if (!Array.isArray(value) || value.length > 5)
    throw new AccountError(400, 'Invalid badges.');
  return communityArray(value).map((value) => {
    const data = object(value);
    keys(data, ['id', 'kind', 'label']);
    const kind = data['kind'];
    if (
      kind !== 'owner' &&
      kind !== 'moderator' &&
      kind !== 'new' &&
      kind !== 'custom'
    )
      throw new AccountError(400, 'Invalid badge.');
    if ((kind === 'custom') !== (data['id'] !== null))
      throw new AccountError(400, 'Invalid badge.');
    return {
      kind,
      label: badgeLabel(data['label']),
      id: data['id'] === null ? null : uuid(data['id']),
    };
  });
}
