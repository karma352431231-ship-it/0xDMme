import type pg from 'pg';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { postVotes } from './community-interactions.ts';
import { sharedPostIds } from './post-sharing.ts';
/** Used only behind authenticated reader authority; anonymous reads omit viewer state. */
export async function withPostInteractions(
  client: Pick<pg.PoolClient, 'query'>,
  actor: string,
  posts: CommunityPost[],
): Promise<CommunityPost[]> {
  const ids = posts.map((post) => post.id);
  const votes = await postVotes(client, actor, ids);
  const shared = await sharedPostIds(client, actor, ids);
  return posts.map((post) => ({
    ...post,
    viewer: {
      vote: votes.get(post.id)?.position ?? 0,
      shared: shared.has(post.id),
    },
  }));
}
