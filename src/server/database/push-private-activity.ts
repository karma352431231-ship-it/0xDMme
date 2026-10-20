/** Fixed subscription alias s. Eligibility and the bounded detail candidates use
 * the same current consent/mute/read/removal rules. No handle DM enters here. */
const individual = `SELECT m.id,m.sender AS peer,m.sequence FROM hash_talk.message_packets m
  LEFT JOIN hash_talk.conversation_controls cc ON cc.account_id=s.account_id AND cc.peer=m.sender
  WHERE m.recipient=s.account_id AND m.body IS NOT NULL AND m.kind<>'profile' AND m.relation IS NULL
  AND NOT EXISTS(SELECT 1 FROM hash_talk.message_reads mr WHERE mr.account_id=m.recipient AND mr.message_id=m.id) AND coalesce(cc.muted_until,0)<=(extract(epoch FROM now())*1000)::bigint
  AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals pr WHERE pr.account_id=s.account_id AND pr.kind='message' AND pr.id=m.id)
  AND EXISTS(SELECT 1 FROM hash_talk.contact_relations cr WHERE cr.lo=least(m.sender,m.recipient) AND cr.hi=greatest(m.sender,m.recipient) AND cr.state='approved')`;
const group = `SELECT m.id,m.group_id AS "group",m.sequence FROM hash_talk.groups g JOIN hash_talk.group_members member ON member.group_id=g.id AND member.account_id=s.account_id LEFT JOIN hash_talk.group_controls cc ON cc.account_id=s.account_id AND cc.group_id=g.id JOIN hash_talk.group_packets m ON m.group_id=g.id AND m.epoch>=member.joined AND m.sender<>s.account_id AND m.body IS NOT NULL AND m.kind<>'profile' WHERE NOT g.deleted AND coalesce(cc.muted_until,0)<=(extract(epoch FROM now())*1000)::bigint AND NOT EXISTS(SELECT 1 FROM hash_talk.group_reads r WHERE r.account_id=s.account_id AND r.message_id=m.id)`;
const cleanup = `SELECT 1 FROM hash_talk.groups g JOIN hash_talk.group_members member ON member.group_id=g.id AND member.account_id=s.account_id LEFT JOIN hash_talk.group_controls cc ON cc.account_id=s.account_id AND cc.group_id=g.id WHERE NOT g.deleted AND coalesce(cc.muted_until,0)<=(extract(epoch FROM now())*1000)::bigint AND EXISTS(SELECT 1 FROM hash_talk.group_cleanups cleanup WHERE cleanup.group_id=g.id AND cleanup.due_at>now())`;
export const privatePushEligible = `(EXISTS(${individual}) OR EXISTS(${group}) OR EXISTS(${cleanup}))`;
export const privatePushRows = `SELECT jsonb_build_object('kind','direct','id',id,'peer',peer) AS value FROM (${individual} ORDER BY m.sequence DESC LIMIT 1) latest
  UNION ALL SELECT jsonb_build_object('kind','group','id',id,'group',"group") AS value FROM (${group} AND m.relation IS NULL ORDER BY m.sequence DESC LIMIT 1) latest`;
