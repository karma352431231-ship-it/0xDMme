-- Pinned group messages (12/11/2026): a pin is one more authenticated action
-- on an original packet, next to edits and reactions.
ALTER TABLE hash_talk.group_packets DROP CONSTRAINT group_packets_relation_check;
ALTER TABLE hash_talk.group_packets ADD CONSTRAINT group_packets_relation_check
  CHECK(relation IS NULL OR (jsonb_typeof(relation)='object' AND relation->>'type' IN ('edit','reaction','pin') AND octet_length(relation::text)<=512));
