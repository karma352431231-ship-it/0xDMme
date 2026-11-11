-- Preserve every original packet and permit authenticated per-author reactions.
ALTER TABLE hash_talk.group_packets DROP CONSTRAINT group_packets_relation_check;
ALTER TABLE hash_talk.group_packets ADD CONSTRAINT group_packets_relation_check
  CHECK(relation IS NULL OR (jsonb_typeof(relation)='object' AND relation->>'type' IN ('edit','reaction') AND octet_length(relation::text)<=512));
CREATE INDEX group_latest_action ON hash_talk.group_packets(group_id,(relation->>'id'),(relation->>'type'),sender,sequence DESC) WHERE relation IS NOT NULL;
