-- Dated follows for the user ranking (owner, 06/11/2026). A follow records
-- when it started and clears that date when it ends; follows made before
-- this migration keep no date and never count as new followers.
ALTER TABLE hash_talk.public_profile_follows ADD COLUMN followed_at timestamptz(3);
ALTER TABLE hash_talk.public_profile_follows
  ADD CONSTRAINT public_profile_follow_dated CHECK(followed_at IS NULL OR following);
CREATE INDEX public_profile_follow_arrivals ON hash_talk.public_profile_follows(target,followed_at)
  WHERE following AND followed_at IS NOT NULL;
-- A started or ended follow asks for the followed profile's ranking again.
-- Deleted rows only follow deleted profiles, whose ranking state goes with them.
CREATE FUNCTION hash_talk.mark_profile_follow_ranking() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.following=NEW.following THEN RETURN NULL; END IF;
  IF TG_OP='INSERT' AND NOT NEW.following THEN RETURN NULL; END IF;
  INSERT INTO hash_talk.profile_ranking_state(profile_id) VALUES(NEW.target)
    ON CONFLICT(profile_id) DO UPDATE SET revision=hash_talk.profile_ranking_state.revision+1;
  PERFORM pg_notify('hash_talk_ranking','');
  RETURN NULL;
END;
$$;
CREATE TRIGGER profile_follow_ranking AFTER INSERT OR UPDATE OF following ON hash_talk.public_profile_follows
  FOR EACH ROW EXECUTE FUNCTION hash_talk.mark_profile_follow_ranking();
