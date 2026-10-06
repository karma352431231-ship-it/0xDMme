import { AccountError } from '../../shared/account/index.ts';
import { communityRevision } from '../../shared/communities/index.ts';
import type { CommunityContext } from './community-authority.ts';
export interface PostRow {
  id: string;
  community_id: string;
  author: string | null;
  title: string;
  text: string;
  tag_id: string | null;
  created_at: Date;
  edited_at: Date | null;
  revision: number;
  deleted: boolean;
  active_removal: string | null;
}
export const postColumns =
  'id,community_id,author,title,text,tag_id,created_at,edited_at,revision,deleted,active_removal';
export async function loadPost(
  context: CommunityContext,
  id: string,
): Promise<PostRow> {
  const found = await context.client.query<PostRow>(
    `SELECT ${postColumns} FROM hash_talk.community_posts WHERE community_id=$1 AND id=$2 FOR UPDATE`,
    [context.row.id, id],
  );
  if (!found.rows[0]) throw new AccountError(404, 'Post indisponível.');
  return found.rows[0];
}
export function currentPost(row: PostRow, revision: unknown): void {
  if (row.revision !== communityRevision(revision))
    throw new AccountError(409, 'O post mudou. Recarregue antes de continuar.');
}
