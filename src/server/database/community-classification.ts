import type pg from 'pg';
import { AccountError, keys } from '../../shared/account/index.ts';
import {
  communityBoolean,
  communityRevision,
} from '../../shared/communities/index.ts';
import {
  communityClassification,
  communityCreationClassification,
} from '../../shared/community-classification/index.ts';
import type { CommunityClassification } from '../../shared/community-classification/index.ts';
import { assertContentCapacity } from './vault-quota.ts';
import {
  currentCommunity,
  requireCommunityManager,
} from './community-authority.ts';
import type { CommunityContext } from './community-authority.ts';

type Reader = Pick<pg.PoolClient, 'query'>;
export async function readCommunityClassifications(
  client: Reader,
  ids: string[],
) {
  if (ids.length > 24) throw new AccountError(400, 'Community page too large.');
  if (!ids.length) return new Map<string, CommunityClassification>();
  const found = await client.query<{
    community_id: string;
    nsfw: boolean;
    topics: string[];
  }>(
    'SELECT community_id,nsfw,topics FROM hash_talk.community_classifications WHERE community_id=ANY($1::uuid[])',
    [ids],
  );
  return new Map(
    found.rows.map((row) => [
      row.community_id,
      communityClassification({ nsfw: row.nsfw, topics: row.topics }),
    ]),
  );
}
export async function createCommunityClassification(
  client: pg.PoolClient,
  id: string,
  input: unknown,
) {
  const value = communityCreationClassification(input);
  await client.query(
    'INSERT INTO hash_talk.community_classifications(community_id,nsfw,topics) VALUES($1,$2,$3::text[])',
    [id, value.nsfw, value.topics],
  );
}
export async function verifyCommunityClassification(
  client: Reader,
  id: string,
  input: unknown,
) {
  const current = (await readCommunityClassifications(client, [id])).get(id);
  if (!current && input !== undefined)
    throw new AccountError(
      409,
      'Classification is available only for new communities.',
    );
  const requested = communityClassification(input);
  if (
    current &&
    (current.nsfw !== requested.nsfw ||
      JSON.stringify(current.topics) !== JSON.stringify(requested.topics))
  )
    throw new AccountError(
      409,
      'Community creation classification already fixed.',
    );
}
/** Static SQL contract owned here; values remain bound query parameters. OR matches any selected topic. */
export function communityTopicPredicate(): string {
  return `(cardinality($8::text[])=0 OR EXISTS(SELECT 1 FROM hash_talk.community_classifications classification WHERE classification.community_id=c.id AND classification.topics && $8::text[]))`;
}
export async function updateCommunityNsfw(
  context: CommunityContext,
  data: Record<string, unknown>,
  capacity: number,
) {
  keys(data, ['id', 'revision', 'nsfw']);
  await requireCommunityManager(context, true);
  currentCommunity(context, communityRevision(data['revision']));
  const nsfw = communityBoolean(data['nsfw']);
  const current = (
    await readCommunityClassifications(context.client, [context.row.id])
  ).get(context.row.id);
  if (!current)
    throw new AccountError(
      409,
      'Classification is available only for new communities.',
    );
  if (current.nsfw === nsfw) return;
  await context.client.query(
    'UPDATE hash_talk.community_classifications SET nsfw=$2 WHERE community_id=$1',
    [context.row.id, nsfw],
  );
  await context.client.query(
    'UPDATE hash_talk.communities SET revision=revision+1 WHERE id=$1',
    [context.row.id],
  );
  await assertContentCapacity(context.client, capacity);
}
