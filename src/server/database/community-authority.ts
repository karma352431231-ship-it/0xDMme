import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { CommunityRole } from '../../shared/communities/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { PublicProfileStore } from './public-profile.ts';
export interface CommunityRecord {
  id: string;
  owner: string | null;
  name: string;
  description: string;
  rules: string;
  revision: number;
  archived: boolean;
  followers: string;
  transfer_id?: string | null;
  transfer_to?: string | null;
}
export interface CommunityContext {
  client: pg.PoolClient;
  actor: PublicProfile;
  row: CommunityRecord;
  profiles: PublicProfileStore;
}
export async function communityRole(
  context: CommunityContext,
): Promise<CommunityRole> {
  if (context.row.owner === context.actor.id) return 'owner';
  const found = await context.client.query(
    'SELECT 1 FROM hash_talk.community_moderators WHERE community_id=$1 AND profile_id=$2',
    [context.row.id, context.actor.id],
  );
  return found.rowCount ? 'moderator' : 'participant';
}
export async function requireCommunityManager(
  context: CommunityContext,
  owner = false,
): Promise<void> {
  const role = await communityRole(context);
  if (role === 'participant' || (owner && role !== 'owner'))
    throw new AccountError(403, 'Você não tem permissão para esta gestão.');
}
export function currentCommunity(
  context: CommunityContext,
  revision: number,
): void {
  if (context.row.revision !== revision)
    throw new AccountError(
      409,
      'A comunidade mudou. Recarregue antes de continuar.',
    );
}
export function openCommunity(context: CommunityContext): void {
  if (context.row.archived)
    throw new AccountError(
      403,
      'Comunidade arquivada: disponível apenas para leitura.',
    );
}
export async function bumpCommunity(context: CommunityContext): Promise<void> {
  await context.client.query(
    'UPDATE hash_talk.communities SET revision=revision+1 WHERE id=$1',
    [context.row.id],
  );
}
export interface SanctionRow {
  id: string;
  target: string;
  actor: string;
  reason: string;
  days: number | null;
  until_at: Date | null;
  lifted: boolean;
  appeal: string | null;
  decision: string | null;
}
export async function activeSanction(
  context: CommunityContext,
  target = context.actor.id,
): Promise<SanctionRow | null> {
  const result = await context.client.query<SanctionRow>(
    'SELECT id,target,actor,reason,days,until_at,lifted,appeal,decision FROM hash_talk.community_sanctions WHERE community_id=$1 AND target=$2 AND NOT lifted AND (until_at IS NULL OR until_at>now()) ORDER BY id LIMIT 1',
    [context.row.id, target],
  );
  return result.rows[0] ?? null;
}
/** Admission is independent of following, and must share the author's write transaction. */
export async function requireCommunityParticipation(
  context: CommunityContext,
): Promise<void> {
  openCommunity(context);
  if (await activeSanction(context))
    throw new AccountError(
      403,
      'Você está suspenso nesta comunidade. Consulte o motivo e a contestação.',
    );
}
export async function communityTarget(
  context: CommunityContext,
  target: string,
): Promise<PublicProfile> {
  const found = (
    await context.profiles.identities(context.client, [target])
  ).get(target);
  if (!found) throw new AccountError(404, 'Perfil público indisponível.');
  return found;
}
