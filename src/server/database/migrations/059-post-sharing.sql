-- Reference-only public reposts; original editing/removal applies immediately.
CREATE TABLE hash_talk.community_post_shares (
  id uuid NOT NULL UNIQUE,
  profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES hash_talk.community_posts(id) ON DELETE CASCADE,
  shared boolean NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(profile_id,post_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX community_shared_activity ON hash_talk.community_post_shares(profile_id,created_at DESC,id DESC) WHERE shared;
CREATE TRIGGER community_share_usage AFTER INSERT OR DELETE OR UPDATE
ON hash_talk.community_post_shares FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
