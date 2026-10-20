import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { communitySlugBase } from '../../shared/community-address/index.ts';
/** Short creation transaction, serialized only for assigning unique public addresses. */
export async function assignCommunityAddress(
  client: pg.PoolClient,
  id: string,
  name: string,
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('hash-talk:community-address'))",
  );
  const base = communitySlugBase(name);
  const candidates = Array.from({ length: 100 }, (_, index) =>
    index ? `${base}-${index + 1}` : base,
  );
  const found = await client.query<{ slug: string }>(
    'SELECT slug FROM hash_talk.community_addresses WHERE slug=ANY($1::text[])',
    [candidates],
  );
  const used = new Set(found.rows.map((row) => row.slug));
  const slug = candidates.find((candidate) => !used.has(candidate));
  if (!slug)
    throw new AccountError(
      409,
      'A community with this name already exists. Choose another.',
    );
  await client.query(
    'INSERT INTO hash_talk.community_addresses(community_id,slug) VALUES($1,$2)',
    [id, slug],
  );
}
