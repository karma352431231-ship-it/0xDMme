-- Posts and replies share author deletion/moderation. Parent/root never change.
ALTER TABLE hash_talk.community_posts
  ADD COLUMN parent_id uuid,
  ADD COLUMN root_id uuid,
  ADD COLUMN score integer NOT NULL DEFAULT 0,
  ADD COLUMN replies integer NOT NULL DEFAULT 0 CHECK(replies>=0),
  ADD FOREIGN KEY(community_id,parent_id) REFERENCES hash_talk.community_posts(community_id,id),
  ADD FOREIGN KEY(community_id,root_id) REFERENCES hash_talk.community_posts(community_id,id),
  ADD CHECK((parent_id IS NULL AND root_id IS NULL) OR (parent_id IS NOT NULL AND root_id IS NOT NULL AND parent_id<>id AND root_id<>id));
CREATE INDEX community_reply_page ON hash_talk.community_posts(community_id,parent_id,created_at DESC,id DESC);
CREATE TABLE hash_talk.community_votes (
  profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES hash_talk.community_posts(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK(position IN (-1,0,1)),
  revision integer NOT NULL CHECK(revision>0),
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(profile_id,post_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX community_vote_target ON hash_talk.community_votes(post_id);
-- Trigger also removes a deleted account's contribution without touching public authorship.
CREATE FUNCTION hash_talk.track_community_vote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE hash_talk.community_posts SET score=score-OLD.position WHERE id=OLD.post_id;
    RETURN OLD;
  ELSIF TG_OP='INSERT' THEN
    UPDATE hash_talk.community_posts SET score=score+NEW.position WHERE id=NEW.post_id;
  ELSE
    UPDATE hash_talk.community_posts SET score=score+NEW.position-OLD.position WHERE id=NEW.post_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER community_vote_score AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_votes FOR EACH ROW EXECUTE FUNCTION hash_talk.track_community_vote();
CREATE TRIGGER community_vote_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_votes FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TABLE hash_talk.community_reply_notifications (
  recipient uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  reply_id uuid NOT NULL REFERENCES hash_talk.community_posts(id) ON DELETE CASCADE,
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  read boolean NOT NULL DEFAULT false,
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(recipient,reply_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX community_notification_page ON hash_talk.community_reply_notifications(recipient,created_at DESC,reply_id DESC);
CREATE TRIGGER community_notification_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_reply_notifications FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
