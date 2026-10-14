-- Additive metadata; existing immutable packets and cleanup semantics stay valid.
ALTER TABLE hash_talk.groups ADD COLUMN message_revision bigint NOT NULL DEFAULT 0
  CHECK(message_revision BETWEEN 0 AND 9007199254740991);
ALTER TABLE hash_talk.group_packets ADD COLUMN relation jsonb
  CHECK(relation IS NULL OR (jsonb_typeof(relation)='object' AND relation->>'type'='edit' AND octet_length(relation::text)<=512));
CREATE INDEX group_packet_relation ON hash_talk.group_packets(group_id,(relation->>'id'),sequence)
  WHERE relation IS NOT NULL;
CREATE TABLE hash_talk.group_message_changes (
  group_id uuid NOT NULL REFERENCES hash_talk.groups(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
  message_id uuid NOT NULL,
  charge integer NOT NULL DEFAULT 528 CHECK(charge=528),
  PRIMARY KEY(group_id,revision)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TRIGGER group_message_change_usage AFTER INSERT OR DELETE ON hash_talk.group_message_changes
  FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE FUNCTION hash_talk.record_group_message_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope uuid; item uuid; version bigint;
BEGIN
  IF TG_TABLE_NAME='group_packets' THEN
    scope:=NEW.group_id; item:=NEW.id;
  ELSE
    IF OLD.status=NEW.status THEN RETURN NULL; END IF;
    scope:=NEW.group_id; item:=NEW.message_id;
    IF NOT EXISTS(SELECT 1 FROM hash_talk.group_packets WHERE group_id=scope AND id=item) THEN RETURN NULL; END IF;
  END IF;
  UPDATE hash_talk.groups SET message_revision=message_revision+1 WHERE id=scope RETURNING message_revision INTO version;
  INSERT INTO hash_talk.group_message_changes(group_id,revision,message_id) VALUES(scope,version,item);
  DELETE FROM hash_talk.group_message_changes WHERE group_id=scope AND revision<=version-256;
  RETURN NULL;
END;
$$;
CREATE TRIGGER group_packet_changes AFTER INSERT OR UPDATE OF body,deletion ON hash_talk.group_packets
  FOR EACH ROW EXECUTE FUNCTION hash_talk.record_group_message_change();
CREATE TRIGGER group_media_changes AFTER UPDATE OF status ON hash_talk.group_media
  FOR EACH ROW EXECUTE FUNCTION hash_talk.record_group_message_change();
