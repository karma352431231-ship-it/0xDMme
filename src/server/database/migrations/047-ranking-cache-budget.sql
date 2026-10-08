-- Constant-size accounting for derived generations, separate from admission's global budget.
CREATE TABLE hash_talk.community_ranking_cache_usage (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  used_bytes bigint NOT NULL CHECK(used_bytes>=0)
);
INSERT INTO hash_talk.community_ranking_cache_usage(singleton,used_bytes)
SELECT true,coalesce((SELECT sum(charge) FROM hash_talk.community_ranking_generations),0)
  +coalesce((SELECT sum(charge) FROM hash_talk.community_ranking_entries),0);
CREATE FUNCTION hash_talk.track_ranking_generation_cache() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE hash_talk.community_ranking_cache_usage SET used_bytes=used_bytes+NEW.charge WHERE singleton;
  ELSE
    UPDATE hash_talk.community_ranking_cache_usage SET used_bytes=used_bytes-OLD.charge WHERE singleton;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER ranking_generation_cache_usage AFTER INSERT OR DELETE ON hash_talk.community_ranking_generations
  FOR EACH ROW EXECUTE FUNCTION hash_talk.track_ranking_generation_cache();
CREATE OR REPLACE FUNCTION hash_talk.track_ranking_entries_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE amount bigint;
BEGIN
  SELECT coalesce(sum(charge),0) INTO amount FROM inserted;
  IF amount<>0 THEN
    UPDATE hash_talk.content_usage SET used_bytes=used_bytes+amount WHERE singleton;
    UPDATE hash_talk.community_ranking_cache_usage SET used_bytes=used_bytes+amount WHERE singleton;
  END IF;
  RETURN NULL;
END;
$$;
CREATE OR REPLACE FUNCTION hash_talk.track_ranking_entries_delete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE amount bigint;
BEGIN
  SELECT coalesce(sum(charge),0) INTO amount FROM removed;
  IF amount<>0 THEN
    UPDATE hash_talk.content_usage SET used_bytes=used_bytes-amount WHERE singleton;
    UPDATE hash_talk.community_ranking_cache_usage SET used_bytes=used_bytes-amount WHERE singleton;
  END IF;
  RETURN NULL;
END;
$$;
