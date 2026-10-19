import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { mentionSpans } from '../../shared/public-mentions/index.ts';
export type MentionSource = {
  kind: 'post' | 'profile' | 'community';
  id: string;
};
const columns = {
  post: 'source_post',
  profile: 'source_profile',
  community: 'source_community',
} as const;
/** Called in the source's authorized transaction: retries/edits keep the same notice. */
export async function reconcileMentionNotifications(
  client: pg.PoolClient,
  input: { source: MentionSource; actor: string; texts: readonly string[] },
): Promise<void> {
  const targets = [
    ...new Set(
      input.texts.flatMap((text) =>
        mentionSpans(text)
          .filter((span) => span.kind === 'user')
          .map((span) => span.id),
      ),
    ),
  ];
  if (targets.length > 64)
    throw new AccountError(400, 'Too many mentions in this publication.');
  const column = columns[input.source.kind];
  await client.query(
    `DELETE FROM hash_talk.public_mention_notifications WHERE ${column}=$1 AND NOT (recipient=ANY($2::uuid[]))`,
    [input.source.id, targets],
  );
  if (!targets.length) return;
  await client.query(
    `INSERT INTO hash_talk.public_mention_notifications(recipient,actor,${column})
    SELECT target.id,$2,$1 FROM hash_talk.public_profiles target WHERE target.id=ANY($3::uuid[]) AND target.id<>$2 AND NOT EXISTS(
      SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND ((b.actor=$2 AND b.target=target.id) OR (b.actor=target.id AND b.target=$2)))
    ORDER BY target.id ON CONFLICT DO NOTHING`,
    [input.source.id, input.actor, targets],
  );
}
