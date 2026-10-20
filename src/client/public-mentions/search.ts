import { fetchApi, readApiJson } from '../api-response/index.ts';
import { publicProfile } from '../../shared/public-profile/index.ts';
import { communityPage } from '../../shared/communities/index.ts';
import { mentionQuery } from '../../shared/public-mentions/index.ts';
import type { PublicMention } from '../../shared/public-mentions/index.ts';
export type MentionChoice = PublicMention & { avatar: string | null };
async function read(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetchApi('public-profile/read', path, {
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
  });
  return readApiJson(response, 'public-profile/read');
}
export async function searchMentions(
  query: string,
  signal: AbortSignal,
): Promise<MentionChoice[]> {
  const key = encodeURIComponent(mentionQuery(query));
  const [users, groups] = await Promise.all([
    read(`/api/public-profiles/_/suggestions?q=${key}`, signal),
    read(`/api/communities/suggestions?q=${key}`, signal),
  ]);
  const communities = communityPage(groups);
  if (!Array.isArray(users) || users.length > 8 || communities.items.length > 8)
    throw new Error('Invalid profile suggestions.');
  return [
    ...users.map(publicProfile).map((profile) => ({
      kind: 'user' as const,
      id: profile.id,
      label: profile.handle,
      avatar: profile.avatar,
    })),
    ...communities.items.map((group) => ({
      kind: 'community' as const,
      id: group.id,
      label: group.name,
      avatar: group.avatar,
    })),
  ];
}
