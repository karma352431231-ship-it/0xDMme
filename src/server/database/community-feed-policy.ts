import type { FeedFilter } from '../../shared/community-discovery/index.ts';
export function feedRank(order: FeedFilter['order']): string {
  return {
    mixed: `floor(1000000*(1+ln(1+greatest(p.score,0)+p.discussion_activity)+
      CASE WHEN EXISTS(SELECT 1 FROM hash_talk.public_profile_follows pf WHERE pf.follower=$1 AND pf.target=p.author AND pf.following) THEN 3 ELSE 0 END)
      /power(2+greatest(0,extract(epoch FROM ($6::timestamptz-p.created_at)))/86400,1.5))::bigint`,
    recent: '0::bigint',
    votes: 'p.score::bigint',
    replies: 'p.replies::bigint',
  }[order];
}
/** Choose representatives before applying a cursor; pagination cannot refill discarded duplicates. */
export function feedSelection(filter: FeedFilter): string {
  if (filter.search) return 'SELECT *,1 AS representative FROM candidates';
  if (filter.scope === 'following')
    return `SELECT *,row_number() OVER(PARTITION BY coalesce(root_id,id),(root_id IS NULL)
    ORDER BY created_at ASC,id ASC) AS representative FROM candidates`;
  if (filter.scope === 'all' && filter.order === 'mixed' && !filter.community)
    return `SELECT *,row_number() OVER(PARTITION BY coalesce(root_id,id),(root_id IS NULL),CASE WHEN root_id IS NULL THEN id ELSE author END
      ORDER BY rank DESC,created_at DESC,id DESC) AS representative FROM candidates`;
  return 'SELECT *,1 AS representative FROM candidates';
}
