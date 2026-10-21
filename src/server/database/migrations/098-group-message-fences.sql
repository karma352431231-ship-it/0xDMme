-- Separate destructive group changes from immutable arrival. A finite read cut
-- accepts later appends as its successor's work, while any later removal or
-- concealment still rejects it. Packet bodies and journal rows are unchanged.
LOCK TABLE hash_talk.groups, hash_talk.group_packets, hash_talk.group_media,
  hash_talk.group_message_changes IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE hash_talk.groups ADD COLUMN message_invalidation bigint NOT NULL DEFAULT 0;
-- Conservative backfill: cuts issued before this migration are invalid once.
UPDATE hash_talk.groups SET message_invalidation=message_revision
  WHERE message_invalidation<>message_revision;
ALTER TABLE hash_talk.groups ADD CONSTRAINT group_message_invalidation
  CHECK(message_invalidation BETWEEN 0 AND message_revision);

-- Removals: an author deletion or retention cleanup clears the body or sets a
-- deletion; media leaving the group moves to 'deleting'. Inserts and the other
-- media transitions (upload progress, acceptance) stay append-only.
CREATE OR REPLACE FUNCTION hash_talk.record_group_message_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope uuid; item uuid; version bigint; removal boolean;
BEGIN
  IF TG_TABLE_NAME='group_packets' THEN
    scope:=NEW.group_id; item:=NEW.id;
    removal:=TG_OP='UPDATE' AND ((OLD.body IS NOT NULL AND NEW.body IS NULL)
      OR NEW.deletion IS DISTINCT FROM OLD.deletion);
  ELSE
    IF OLD.status=NEW.status THEN RETURN NULL; END IF;
    scope:=NEW.group_id; item:=NEW.message_id;
    IF NOT EXISTS(SELECT 1 FROM hash_talk.group_packets WHERE group_id=scope AND id=item) THEN RETURN NULL; END IF;
    removal:=NEW.status='deleting';
  END IF;
  UPDATE hash_talk.groups SET message_revision=message_revision+1,
    message_invalidation=CASE WHEN removal THEN message_revision+1 ELSE message_invalidation END
    WHERE id=scope RETURNING message_revision INTO version;
  INSERT INTO hash_talk.group_message_changes(group_id,revision,message_id) VALUES(scope,version,item);
  DELETE FROM hash_talk.group_message_changes WHERE group_id=scope AND revision<=version-256;
  RETURN NULL;
END;
$$;

-- A reader may bound a cut by the highest packet sequence only with CACHE 1.
-- Writers allocate identities under the group row lock; cached blocks could
-- violate that ordering across sessions. Fail rather than silently change it.
DO $$ BEGIN
  IF (SELECT seqcache FROM pg_sequence WHERE seqrelid=pg_get_serial_sequence('hash_talk.group_packets','sequence')::regclass) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Group message cuts require a CACHE 1 identity';
  END IF;
END $$;
