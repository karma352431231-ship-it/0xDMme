import { AccountError } from '../../shared/account/index.ts';
import type { MessagePacket } from '../../shared/messages/index.ts';
import type { SocialContext } from './social-dm.ts';

/** Lock the immutable root before admitting an action; edits and reactions share the 64-action budget. */
export async function admitSocialAction(
  context: SocialContext,
  packet: MessagePacket,
): Promise<void> {
  const relation = packet.relation;
  if (!relation) return;
  const result = await context.client.query<{
    hash: string;
    body: MessagePacket | null;
  }>('SELECT hash,body FROM hash_talk.social_messages WHERE id=$1 FOR UPDATE', [
    relation.id,
  ]);
  const target = result.rows[0];
  if (!validTarget(target, packet))
    throw new AccountError(409, 'Message action target is unavailable.');
  const removed = await context.client.query(
    "SELECT 1 FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='dm-message' AND id=$2",
    [context.authority.session.accountId, relation.id],
  );
  if (removed.rowCount)
    throw new AccountError(409, 'Message action target is unavailable.');
  const actions = await context.client.query(
    "SELECT id FROM hash_talk.social_messages WHERE body->'relation' IS NOT NULL AND sender=ANY($1::uuid[]) AND body->'relation'->>'id'=$2 LIMIT 64",
    [[packet.sender, packet.recipient], relation.id],
  );
  if (actions.rowCount === 64)
    throw new AccountError(409, 'Message action limit reached.');
}

function validTarget(
  target: { hash: string; body: MessagePacket | null } | undefined,
  packet: MessagePacket,
): boolean {
  if (!target?.body) return false;
  const relation = packet.relation!;
  return (
    target.hash === relation.hash &&
    !target.body.relation &&
    target.body.sender === relation.author &&
    (relation.type !== 'edit' ||
      (packet.sender === target.body.sender && target.body.kind === 'text')) &&
    [target.body.sender, target.body.recipient].includes(packet.sender) &&
    [target.body.sender, target.body.recipient].includes(packet.recipient)
  );
}
