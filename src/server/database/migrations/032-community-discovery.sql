-- Account-scoped references, never copied post content or private-message activity.
CREATE TABLE hash_talk.community_post_preferences (
  profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES hash_talk.community_posts(id) ON DELETE CASCADE,
  saved boolean NOT NULL,
  hidden boolean NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(profile_id,post_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX community_saved ON hash_talk.community_post_preferences(profile_id,post_id) WHERE saved;
CREATE INDEX community_hidden ON hash_talk.community_post_preferences(profile_id,post_id) WHERE hidden;
CREATE TRIGGER community_preference_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_post_preferences FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE INDEX community_feed_recent ON hash_talk.community_posts(created_at DESC,id DESC) WHERE parent_id IS NULL AND NOT deleted AND active_removal IS NULL;
CREATE INDEX community_activity ON hash_talk.community_posts(created_at,community_id) WHERE NOT deleted AND active_removal IS NULL;
