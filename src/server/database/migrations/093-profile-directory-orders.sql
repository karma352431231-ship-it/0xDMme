-- Public directory orders share the bounded, charged ranking generations.
ALTER TABLE hash_talk.profile_ranking_entries
  ADD COLUMN followers bigint NOT NULL DEFAULT 0 CHECK(followers>=0);
CREATE INDEX profile_ranking_size ON hash_talk.profile_ranking_entries(generation,period,followers DESC,profile_id DESC);

CREATE FUNCTION hash_talk.mark_profile_directory() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE who uuid;
BEGIN
  IF TG_TABLE_NAME='public_profiles' THEN who:=NEW.id;
  ELSE
    IF TG_OP='UPDATE' AND OLD.following=NEW.following THEN RETURN NEW; END IF;
    IF TG_OP='INSERT' AND NOT NEW.following THEN RETURN NEW; END IF;
    IF TG_OP='DELETE' AND NOT OLD.following THEN RETURN OLD; END IF;
    IF TG_OP='DELETE' THEN who:=OLD.target; ELSE who:=NEW.target; END IF;
  END IF;
  INSERT INTO hash_talk.profile_ranking_state(profile_id)
    SELECT id FROM hash_talk.public_profiles WHERE id=who
    ON CONFLICT(profile_id) DO UPDATE SET revision=hash_talk.profile_ranking_state.revision+1;
  PERFORM pg_notify('hash_talk_ranking','');
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER profile_directory_created AFTER INSERT ON hash_talk.public_profiles
  FOR EACH ROW EXECUTE FUNCTION hash_talk.mark_profile_directory();
CREATE TRIGGER profile_directory_followed AFTER INSERT OR DELETE OR UPDATE OF following ON hash_talk.public_profile_follows
  FOR EACH ROW EXECUTE FUNCTION hash_talk.mark_profile_directory();
-- Rebuild derived snapshots once; no source profile, follow or contribution changes.
UPDATE hash_talk.community_ranking_generations SET expires_at=least(expires_at,clock_timestamp());
