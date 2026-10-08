-- Publishing a full candidate generation must not update the global counter once per row.
DROP TRIGGER ranking_entry_usage ON hash_talk.community_ranking_entries;
CREATE FUNCTION hash_talk.track_ranking_entries_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE amount bigint;
BEGIN
  SELECT coalesce(sum(charge),0) INTO amount FROM inserted;
  IF amount<>0 THEN UPDATE hash_talk.content_usage SET used_bytes=used_bytes+amount WHERE singleton; END IF;
  RETURN NULL;
END;
$$;
CREATE FUNCTION hash_talk.track_ranking_entries_delete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE amount bigint;
BEGIN
  SELECT coalesce(sum(charge),0) INTO amount FROM removed;
  IF amount<>0 THEN UPDATE hash_talk.content_usage SET used_bytes=used_bytes-amount WHERE singleton; END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER ranking_entries_insert_usage AFTER INSERT ON hash_talk.community_ranking_entries
  REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_ranking_entries_insert();
CREATE TRIGGER ranking_entries_delete_usage AFTER DELETE ON hash_talk.community_ranking_entries
  REFERENCING OLD TABLE AS removed FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_ranking_entries_delete();

-- Record independently versioned definitions and the source revision actually consumed.
ALTER TABLE hash_talk.community_ranking_generations ADD COLUMN metrics_version integer NOT NULL DEFAULT 1;
ALTER TABLE hash_talk.community_ranking_entries ADD COLUMN source_revision bigint NOT NULL DEFAULT 0;
